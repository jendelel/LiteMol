namespace LiteMol.PrankWeb.DataLoader {
    import Bootstrap = LiteMol.Bootstrap;
    import Transformer = Bootstrap.Entity.Transformer;
    import Query = LiteMol.Core.Structure.Query;

    export interface PrankData {
        model: Bootstrap.Entity.Molecule.Model;
        prediction: Prediction;
        sequence: SequenceEntity;
        atomColorMapping: Uint8Array;
    }

    function getColorMapping(model: Bootstrap.Entity.Molecule.Model, prediction: Prediction, sequence: SequenceEntity) {
        const atomColorMap = new Uint8Array(model.props.model.data.atoms.count);
        let pockets = prediction.props.pockets;
        pockets.forEach((pocket, i) => {
            for (const atom of pocket.surfAtomIds) {
                atomColorMap[atom - 1] = (i % 8) + 1; // Index of color that we want for the particular atom. i.e. Colors.get(i%8)
            }
        });
        return atomColorMap;
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
                    let atomColorMapping = getColorMapping(model, prediction, sequence);
                    if (!prediction)
                        rej("Unable to load predictions.");
                    else if (!sequence)
                        rej("Unable to load protein sequence.");
                    else {
                        res({ model, prediction, sequence, atomColorMapping });
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
            polymer.then(Transformer.Molecule.CreateVisual, { style: cartoonStyle }, { ref: 'polymer-cartoon' });
            polymer.then(Transformer.Molecule.CreateVisual, { style: surfaceStyle }, { ref: 'polymer-surface' })

            // Ligand.
            let het = action.add(data.model, Transformer.Molecule.CreateSelectionFromQuery, { query: Core.Structure.Query.hetGroups(), name: 'HET', silent: true }, { isBinding: true })
            het.then(Transformer.Molecule.CreateVisual, { style: Bootstrap.Visualization.Molecule.Default.ForType.get('BallsAndSticks') });

            // Water.
            let water = action.add(data.model, Transformer.Molecule.CreateSelectionFromQuery, { query: Core.Structure.Query.entities({ type: 'water' }), name: 'Water', silent: true }, { isBinding: true })
            water.then(Transformer.Molecule.CreateVisual, { style: ballsAndSticksStyle });

            // Create a group for all pockets.
            let pocketGroup = action.add(data.model, Transformer.Basic.CreateGroup, { label: 'Group', description: 'Pockets' });
            // For each pocket create selections, but don't create any visuals for them. 
            pockets.forEach((pocket, i) => {
                let query: Query.Builder = Query.atomsById.apply(null, pocket.surfAtomIds);
                // Create selection.
                let sel = pocketGroup.then(Transformer.Molecule.CreateSelectionFromQuery, { query: query, name: pockets[i].name, silent: true }, { ref: pockets[i].name })
                //sel.then(<any>Transformer.Molecule.CreateVisual, { style: Bootstrap.Visualization.Molecule.Default.ForType.get('BallsAndSticks') }, { isHidden: false });
                //sel.then(<any>Transformer.Molecule.CreateVisual, { style: selectionStyle }, { isHidden: false });
            });
            plugin.applyTransform(action)
                .then(function () { return res(data) })
                .catch(function (e) { return rej(e); })
        });
    }

    export function colorProteinFuture(plugin:Plugin.Controller, data:PrankData) {
        return new LiteMol.Promise<PrankData>((res, rej) => {
            colorProtein(plugin, data.atomColorMapping);
            res(data);
        });        
    }

    export function colorProtein(plugin: Plugin.Controller, atomColorMapping: Uint8Array) {
        let colorMap = LiteMol.Core.Utils.FastMap.create<number, Visualization.Color>();
        const fallbackColor = Visualization.Color.fromHex(0xffffff); // white
        colorMap.set(0, fallbackColor);
        // Fill the color map with colors.
        Colors.forEach((color, i) => colorMap.set(i! + 1, color!));

        const colors = Core.Utils.FastMap.create<string, LiteMol.Visualization.Color>();
        colors.set('Uniform', fallbackColor)
        colors.set('Selection', Visualization.Theme.Default.SelectionColor)
        colors.set('Highlight', Visualization.Theme.Default.HighlightColor)

        // Create mapping, theme and apply to all protein visuals.
        const mapping = Visualization.Theme.createColorMapMapping(i => atomColorMapping[i], colorMap, fallbackColor);
        // make the theme "sticky" so that it persist "ResetScene" command.
        const themeTransparent = Visualization.Theme.createMapping(mapping, { colors, isSticky: true, transparency: { alpha: 0.5 } });
        const theme = Visualization.Theme.createMapping(mapping, { colors, isSticky: true });

        const surface = plugin.selectEntities(Bootstrap.Tree.Selection.byRef('polymer-surface').subtree().ofType(Bootstrap.Entity.Molecule.Visual))[0];
        const cartoon = plugin.selectEntities(Bootstrap.Tree.Selection.byRef('polymer-cartoon').subtree().ofType(Bootstrap.Entity.Molecule.Visual))[0];
        plugin.command(Bootstrap.Command.Visual.UpdateBasicTheme, { visual: surface as any, theme: themeTransparent });
        plugin.command(Bootstrap.Command.Visual.UpdateBasicTheme, { visual: cartoon as any, theme });
    }
}