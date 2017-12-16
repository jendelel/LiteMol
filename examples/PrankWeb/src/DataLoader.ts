namespace LiteMol.PrankWeb.DataLoader {
    import Bootstrap = LiteMol.Bootstrap;
    import Transformer = Bootstrap.Entity.Transformer;
    import Query = LiteMol.Core.Structure.Query;

    export interface PrankData {
        model: Bootstrap.Entity.Molecule.Model;
        prediction: Prediction;
        sequence: SequenceEntity;
    }

    export function residuesBySeqNums(...seqNums: string[]) { 
        return Query.residues(...seqNums.map(seqNum => {
            let num = 0;
            let insCode : string|null = null;
            let parsedNum = seqNum.match(/^[0-9]*/);
            let parsedInsCode = seqNum.match(/[A-Z]+$/);
            if (parsedNum != null && parsedNum.length > 0) {
                num = parseInt(parsedNum[0]);
            }
            if (parsedInsCode != null && parsedInsCode.length > 0) {
                insCode = parsedInsCode[0];
            }
            return { authSeqNumber: num, insCode};
        }));
    }

    function initColorMapping(model: Bootstrap.Entity.Molecule.Model, prediction: Prediction, sequence: SequenceEntity) {
        const atomColorMapConservation = new Uint8Array(model.props.model.data.atoms.count);
        const atomColorMap = new Uint8Array(model.props.model.data.atoms.count);
        const residueColorMap = new Uint8Array(model.props.model.data.atoms.count);
        let seq = sequence.props.seq
        let seqIndices = seq.indices;
        let seqScores = seq.scores;
        if (seqScores != null) {
            seqIndices.forEach((seqIndex, i) => {
                let shade = Math.round((1-seqScores[i]) * 10); // Shade within [0,10]
                let query = residuesBySeqNums(seqIndex).compile()
                for (const atom of query(model.props.model.queryContext).unionAtomIndices()) {
                    atomColorMap[atom] = shade + Colors.size + 1; // First there is fallbackColor(0), then pocketColors(1-9) and lastly conservation colors.
                    atomColorMapConservation[atom] = shade + Colors.size + 1; // First there is fallbackColor(0), then pocketColors(1-9) and lastly conservation colors.
                    residueColorMap[atom] = shade + Colors.size + 1;
                }
            });
        }

        let pockets = prediction.props.pockets;
        pockets.forEach((pocket, i) => {
            let pocketQuery = Query.atomsById.apply(null, pocket.surfAtomIds).compile()
            let pocketResQuery = residuesBySeqNums(...pocket.residueIds).compile()
            const colorIndex = (i % Colors.size) + 1; // Index of color that we want for the particular atom. i.e. Colors.get(i%Colors.size);
            for (const atom of pocketQuery(model.props.model.queryContext).unionAtomIndices()) {
                atomColorMap[atom] = colorIndex;
            }
            for (const atom of pocketResQuery(model.props.model.queryContext).unionAtomIndices()) {
                residueColorMap[atom] = colorIndex;
            }
        });
        return { atomColorMap, atomColorMapConservation, residueColorMap };
    }

    export function loadData(plugin: Plugin.Controller, inputType: string, inputId: string) {
        return new LiteMol.Promise<PrankData>((res, rej) => {
            plugin.clear();
            let pdbUrl: string;
            let seqUrl: string;
            let csvUrl: string;
            if (inputType == "pdb") {
                pdbUrl = "/api/id/pdb/" + inputId;
                csvUrl = "/api/id/csv/" + inputId;
                seqUrl = "/api/id/seq/" + inputId;
            }
            else {
                pdbUrl = "/api/upload/pdb/" + inputId;
                csvUrl = "/api/upload/csv/" + inputId;
                seqUrl = "/api/upload/seq/" + inputId;
            }
            // Download pdb and create a model.
            let model = plugin.createTransform()
                .add(plugin.root, Transformer.Data.Download, { url: pdbUrl, type: 'String', id: inputType })
                .then(Transformer.Molecule.CreateFromData, { format: LiteMol.Core.Formats.Molecule.SupportedFormats.PDB }, { isBinding: true })
                .then(Transformer.Molecule.CreateModel, { modelIndex: 0 }, { ref: 'model' });
            // Download and parse predictions.
            model.add(plugin.root, Transformer.Data.Download, { url: csvUrl, type: 'String', id: 'predictions' }, { isHidden: true })
                .then(Transformer.Data.ParseJson, { id: 'P2RANK Data' })
                .then(PrankWeb.ParseAndCreatePrediction, {}, { ref: 'pockets', isHidden: true });
            // Download and store sequence
            model.add(plugin.root, Transformer.Data.Download, { url: seqUrl, type: 'String', id: 'sequence' }, { isHidden: true })
                .then(Transformer.Data.ParseJson, { id: 'Sequence Data' })
                .then(PrankWeb.CreateSequence, {}, { ref: 'sequence', isHidden: true });
            plugin.applyTransform(model)
                .then(function () {
                    let model = plugin.context.select('model')[0] as Bootstrap.Entity.Molecule.Model;
                    let prediction = plugin.context.select('pockets')[0] as Prediction;
                    let sequence = plugin.context.select('sequence')[0] as SequenceEntity;
                    let mappings = initColorMapping(model, prediction, sequence);
                    DataLoader.setAtomColorMapping(plugin, model, mappings.atomColorMap, false);
                    DataLoader.setAtomColorMapping(plugin, model, mappings.atomColorMapConservation, true);
                    DataLoader.setResidueColorMapping(plugin, model, mappings.residueColorMap);
                    if (!prediction)
                        rej("Unable to load predictions.");
                    else if (!sequence)
                        rej("Unable to load protein sequence.");
                    else {
                        res({ model, prediction, sequence });
                    }
                }).catch(function (e) { return rej(e); });
        });
    }

    export function visualizeData(plugin: Plugin.Controller, data: PrankData) {
        return new LiteMol.Promise<PrankData>((res, rej) => {
            let pockets = data.prediction.props.pockets;

            // Specify styles for visual.
            let cartoonsColors = Bootstrap.Visualization.Molecule.UniformBaseColors;
            let cartoonStyle: Bootstrap.Visualization.Molecule.Style<any> = {
                type: 'Cartoons', params: { detail: 'Automatic' },
                theme: { template: Bootstrap.Visualization.Molecule.Default.UniformThemeTemplate, colors: cartoonsColors }
            }

            // Create color theme for pockets.
            let surfaceColors = Bootstrap.Immutable.Map<string, Visualization.Color>()
                .set('Uniform', Visualization.Color.fromHex(0xffffff))
                .set('Selection', Visualization.Theme.Default.SelectionColor)
                .set('Highlight', Visualization.Theme.Default.HighlightColor);

            // Style for protein surface.
            let surfaceStyle: Bootstrap.Visualization.Molecule.Style<Bootstrap.Visualization.Molecule.SurfaceParams> = {
                type: 'Surface',
                params: { probeRadius: 0.55, density: 1.4, smoothing: 4, isWireframe: false },
                theme: { template: Bootstrap.Visualization.Molecule.Default.UniformThemeTemplate, colors: surfaceColors, transparency: { alpha: 0.6 } }
            };
            // Style for water.
            let ballsAndSticksStyle: Bootstrap.Visualization.Molecule.Style<Bootstrap.Visualization.Molecule.BallsAndSticksParams> = {
                type: 'BallsAndSticks',
                params: { useVDW: false, atomRadius: 0.23, bondRadius: 0.09, detail: 'Automatic' },
                theme: { template: Bootstrap.Visualization.Molecule.Default.ElementSymbolThemeTemplate, colors: Bootstrap.Visualization.Molecule.Default.ElementSymbolThemeTemplate.colors, transparency: { alpha: 0.25 } }
            }

            let action = plugin.createTransform();
            // Create visuals for protein, ligand and water.
            // Protein.
            let polymer = action.add(data.model, Transformer.Molecule.CreateSelectionFromQuery, { query: Core.Structure.Query.nonHetPolymer(), name: 'Polymer', silent: true }, { isBinding: true, ref: 'polymer' })
            let colPolymerGroup = polymer.then(Transformer.Basic.CreateGroup, {label: 'Color view', description:"Colored views"})
            colPolymerGroup.then(Transformer.Molecule.CreateVisual, { style: cartoonStyle }, { ref: 'polymer-cartoon-col' });
            colPolymerGroup.then(Transformer.Molecule.CreateVisual, { style: surfaceStyle }, { ref: 'polymer-surface-col' });
            colPolymerGroup.then(Transformer.Molecule.CreateVisual, { style: Bootstrap.Visualization.Molecule.Default.ForType.get('BallsAndSticks')}, {ref: 'polymer-atoms-col'});

            // Ligand.
            let het = action.add(data.model, Transformer.Molecule.CreateSelectionFromQuery, { query: Core.Structure.Query.hetGroups(), name: 'HET', silent: true }, { isBinding: true })
            het.then(Transformer.Molecule.CreateVisual, { style: Bootstrap.Visualization.Molecule.Default.ForType.get('BallsAndSticks') });

            // Water.
            let water = action.add(data.model, Transformer.Molecule.CreateSelectionFromQuery, { query: Core.Structure.Query.entities({ type: 'water' }), name: 'Water', silent: true }, { isBinding: true, isHidden:true })
            water.then(Transformer.Molecule.CreateVisual, { style: ballsAndSticksStyle });

            // Create a group for all pockets.
            let pocketGroup = action.add(data.model, Transformer.Basic.CreateGroup, { label: 'Pockets', description: 'Pockets' }, {ref: "pockets"});
            // For each pocket create selections, but don't create any visuals for them. 
            let allPocketsAtoms
            pockets.forEach((pocket, i) => {
                let pocketSubGroup = pocketGroup.then(Transformer.Basic.CreateGroup, { label: pockets[i].name, description: pockets[i].name }, {ref: pockets[i].name});
                let query: Query.Builder = Query.atomsById.apply(null, pocket.surfAtomIds);
                let resQuery: Query.Builder = residuesBySeqNums(...pocket.residueIds);
                // Create selection.
                let atomSel = pocketGroup.then(Transformer.Molecule.CreateSelectionFromQuery, { query: query, name: `${pockets[i].name}-atoms`, silent: true }, { ref: `${pockets[i].name}-atoms` })
                let resSel = pocketGroup.then(Transformer.Molecule.CreateSelectionFromQuery, { query: resQuery, name: `${pockets[i].name}-res`, silent: true }, { ref: `${pockets[i].name}-res` })
                resSel.then(<any>Transformer.Molecule.CreateVisual, { style: Bootstrap.Visualization.Molecule.Default.ForType.get('BallsAndSticks') }, { isHidden: false, ref: `${pockets[i].name}-res-vis` });
                //sel.then(<any>Transformer.Molecule.CreateVisual, { style: selectionStyle }, { isHidden: false });
            });
            plugin.applyTransform(action)
                .then(function () { return res(data) })
                .catch(function (e) { return rej(e); })
        });
    }

    export function setAtomColorMapping(plugin: Plugin.Controller, model: Bootstrap.Entity.Molecule.Model, mapping: Uint8Array, original: boolean = false) {
        let ctx = plugin.context
        let cache = ctx.entityCache;
        let cacheId = original ? '__PrankWeb__atomColorMapping__original__' : '__PrankWeb__atomColorMapping__'
        cache.set(model, cacheId, mapping)
    }

    export function getAtomColorMapping(plugin: Plugin.Controller, model: Bootstrap.Entity.Molecule.Model, original: boolean = false) {
        let ctx = plugin.context
        let cache = ctx.entityCache;
        let cacheId = original ? '__PrankWeb__atomColorMapping__original__' : '__PrankWeb__atomColorMapping__'
        return cache.get<Uint8Array>(model, cacheId);
    }

    export function setResidueColorMapping(plugin: Plugin.Controller, model: Bootstrap.Entity.Molecule.Model, mapping: Uint8Array) {
        let ctx = plugin.context
        let cache = ctx.entityCache;
        let cacheId = '__PrankWeb__residueColorMapping__'
        cache.set(model, cacheId, mapping)
    }

    export function getResidueColorMapping(plugin: Plugin.Controller, model: Bootstrap.Entity.Molecule.Model) {
        let ctx = plugin.context
        let cache = ctx.entityCache;
        let cacheId = '__PrankWeb__residueColorMapping__'
        return cache.get<Uint8Array>(model, cacheId);
    }

    export function colorProteinFuture(plugin: Plugin.Controller, data: PrankData) {
        return new LiteMol.Promise<PrankData>((res, rej) => {
            if (colorProtein(plugin)) {
                res(data);
            } else {
                rej("Mapping or model not found!");
            }
        });
    }

    export function colorProtein(plugin: Plugin.Controller) {
        let model = plugin.context.select('model')[0] as Bootstrap.Entity.Molecule.Model;
        if (!model) return false;
        let atomColorMapping = getAtomColorMapping(plugin, model);
        if (!atomColorMapping) return false;
        let residueColorMapping = getResidueColorMapping(plugin, model);
        if (!residueColorMapping) return false;
        let colorMap = LiteMol.Core.Utils.FastMap.create<number, Visualization.Color>();
        const fallbackColor = Visualization.Color.fromHex(0xffffff); // white
        colorMap.set(0, fallbackColor);
        // Fill the color map with colors.
        Colors.forEach((color, i) => colorMap.set(i! + 1, color!));
        for (const shade of [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
            let c = shade * 255;
            colorMap.set(colorMap.size, Visualization.Color.fromRgb(c, c, c));
        }

        const colors = Core.Utils.FastMap.create<string, LiteMol.Visualization.Color>();
        colors.set('Uniform', fallbackColor)
        colors.set('Selection', Visualization.Theme.Default.SelectionColor)
        colors.set('Highlight', Visualization.Theme.Default.HighlightColor)

        // Create mapping, theme and apply to all protein visuals.
        const atomMapping = Visualization.Theme.createColorMapMapping(i => atomColorMapping![i], colorMap, fallbackColor);
        const residueMapping = Visualization.Theme.createColorMapMapping(i => residueColorMapping![i], colorMap, fallbackColor);
        // make the theme "sticky" so that it persist "ResetScene" command.
        const theme = Visualization.Theme.createMapping(atomMapping, { colors, isSticky: true, transparency: { alpha: 1 } });
        const residueTheme = Visualization.Theme.createMapping(residueMapping, { colors, isSticky: true });

        const surface = plugin.selectEntities(Bootstrap.Tree.Selection.byRef('polymer-surface-col').subtree().ofType(Bootstrap.Entity.Molecule.Visual))[0];
        const cartoon = plugin.selectEntities(Bootstrap.Tree.Selection.byRef('polymer-cartoon-col').subtree().ofType(Bootstrap.Entity.Molecule.Visual))[0];
        const atoms = plugin.selectEntities(Bootstrap.Tree.Selection.byRef('polymer-atoms-col').subtree().ofType(Bootstrap.Entity.Molecule.Visual))[0];
        plugin.command(Bootstrap.Command.Visual.UpdateBasicTheme, { visual: surface as any, theme: theme });
        Bootstrap.Command.Entity.SetVisibility.dispatch(plugin.context, { entity: surface, visible: false });
        plugin.command(Bootstrap.Command.Visual.UpdateBasicTheme, { visual: cartoon as any, theme: residueTheme });
        Bootstrap.Command.Entity.SetVisibility.dispatch(plugin.context, { entity: cartoon, visible: true });
        plugin.command(Bootstrap.Command.Visual.UpdateBasicTheme, { visual: atoms as any, theme: theme });
        Bootstrap.Command.Entity.SetVisibility.dispatch(plugin.context, { entity: atoms, visible: false });
        
        plugin.selectEntities(Bootstrap.Tree.Selection.byRef('pockets').subtree().ofType(Bootstrap.Entity.Molecule.Visual)).forEach(selection => {;
            plugin.command(Bootstrap.Command.Visual.UpdateBasicTheme, { visual: selection as any, theme: theme });
        });

        return true;
    }
}