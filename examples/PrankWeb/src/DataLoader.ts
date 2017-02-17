namespace LiteMol.PrankWeb.DataLoader {
    import Bootstrap = LiteMol.Bootstrap;
    import Transformer = Bootstrap.Entity.Transformer;
    import Query = LiteMol.Core.Structure.Query;

    export interface PrankData {
        model: Bootstrap.Entity.Molecule.Model;
        prediction: Prediction;
        sequence: SequenceEntity;
    }

    export function loadData(plugin: Plugin.Controller, inputType: string, inputId: string) {
        return new LiteMol.Promise<{ plugin: Plugin.Controller, data: PrankData }>((res, rej) => {
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
                    if (!prediction)
                        rej("Unable to load predictions.");
                    else if (!sequence)
                        rej("Unable to load protein sequence.");
                    else {
                        res({ plugin: plugin, data: { model: model, prediction: prediction, sequence: sequence } });
                    }
                }).catch(function (e) { return rej(e); });
        });
    }

    export function visualizeData(plugin: Plugin.Controller, data: PrankData) {
        return new LiteMol.Promise<PrankData>((res, rej) => {
            let pockets = data.prediction.props.pockets;
            // Select specific sets of atoms and create visuals.
            let selectionQueries: Query.Builder[] = [];
            let allPocketIds: number[] = [];
            pockets.forEach((pocket) => {
                selectionQueries.push(Query.atomsById.apply(null, pocket.surfAtomIds));
                pocket.surfAtomIds.forEach((id) => { allPocketIds.push(id); });
            });
            let surfaceColors = Bootstrap.Immutable.Map<string, Visualization.Color>()
                .set('Uniform', Visualization.Color.fromHex(0xff0000))
                .set('Selection', Visualization.Theme.Default.SelectionColor)
                .set('Highlight', Visualization.Theme.Default.HighlightColor);
            let cartoonsColors = Bootstrap.Visualization.Molecule.UniformBaseColors;

            // Selection of complement of the previous set.
            let complement: Query.Builder = Query.atomsById.apply(null, allPocketIds).complement();
            let complementColors = surfaceColors.set('Uniform', LiteMol.Visualization.Color.fromHex(0xffffff));
            let complementStyle: Bootstrap.Visualization.Molecule.Style<Bootstrap.Visualization.Molecule.SurfaceParams> = {
                type: 'Surface',
                params: { probeRadius: 0.5, density: 1.4, smoothing: 4, isWireframe: false },
                theme: { template: Bootstrap.Visualization.Molecule.Default.UniformThemeTemplate, colors: complementColors, transparency: { alpha: 0.4 } }
            };

            let action = plugin.createTransform();
            // Create a selection on the model and create a visual for it...
            action
                .add(data.model, Transformer.Molecule.CreateSelectionFromQuery, { query: complement, name: 'Protein complement', silent: true }, {})
                .then(Transformer.Molecule.CreateVisual, { style: complementStyle }, { isHidden: false });
            // Create cartoons model from the whole protein.
            let cartoonStyle: Bootstrap.Visualization.Molecule.Style<any> = {
                type: 'Cartoons', params: { detail: 'Automatic' },
                theme: {template: Bootstrap.Visualization.Molecule.Default.UniformThemeTemplate, colors: cartoonsColors}
            }
            cartoonStyle.theme.colors = cartoonsColors;
            action.add(data.model, Transformer.Molecule.CreateVisual, { style: cartoonStyle }, {});

            // For each pocket: 
            selectionQueries.forEach((selectionQuery, i) => {
                // Set selection style (i.e. color, probe, density etc.)
                let selectionColor = surfaceColors.set('Uniform', Colors.get(i % 6));
                let selectionStyle: Bootstrap.Visualization.Molecule.Style<Bootstrap.Visualization.Molecule.SurfaceParams> = {
                    type: 'Surface',
                    params: { probeRadius: 0.5, density: 1.25, smoothing: 3, isWireframe: false },
                    theme: { template: Bootstrap.Visualization.Molecule.Default.UniformThemeTemplate, colors: selectionColor, transparency: { alpha: 0.8 } }
                };
                // Create selection and create visual (surface and ball and sticks)
                let sel = action
                    .add(data.model, Transformer.Molecule.CreateSelectionFromQuery, { query: selectionQuery, name: pockets[i].name, silent: true }, { ref: pockets[i].name })
                sel.then(<any>Transformer.Molecule.CreateVisual, { style: Bootstrap.Visualization.Molecule.Default.ForType.get('BallsAndSticks') }, { isHidden: false });
                sel.then(<any>Transformer.Molecule.CreateVisual, { style: selectionStyle }, { isHidden: false });
            });
            plugin.applyTransform(action);
            res(data);
        });
    }

}