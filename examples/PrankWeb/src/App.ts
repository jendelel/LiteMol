namespace LiteMol.PrankWeb {

    import Plugin = LiteMol.Plugin;
    import Query = LiteMol.Core.Structure.Query;
    import Views = Plugin.Views;
    import Bootstrap = LiteMol.Bootstrap;
    import Transformer = Bootstrap.Entity.Transformer;
    import LayoutRegion = Bootstrap.Components.LayoutRegion;

    export function create(target: HTMLElement) {

        let spec: Plugin.Specification = {
            settings: {},
            transforms: [

            ],
            behaviours: [
                // you will find the source of all behaviours in the Bootstrap/Behaviour directory

                Bootstrap.Behaviour.SetEntityToCurrentWhenAdded,
                Bootstrap.Behaviour.FocusCameraOnSelect,
                Bootstrap.Behaviour.UnselectElementOnRepeatedClick,

                // this colors the visual when a selection is created on it.
                //Bootstrap.Behaviour.ApplySelectionToVisual,

                // this colors the visual when it's selected by mouse or touch
                Bootstrap.Behaviour.ApplyInteractivitySelection,

                // this shows what atom/residue is the pointer currently over
                Bootstrap.Behaviour.Molecule.HighlightElementInfo,

                // distance to the last "clicked" element
                Bootstrap.Behaviour.Molecule.DistanceToLastClickedElement,

                // when somethinh is selected, this will create an "overlay visual" of the selected residue and show every other residue within 5ang
                // you will not want to use this for the ligand pages, where you create the same thing this does at startup
                //Bootstrap.Behaviour.Molecule.ShowInteractionOnSelect(5),                

                // this tracks what is downloaded and some basic actions. Does not send any private data etc.
                // While it is not required for any functionality, we as authors are very much interested in basic 
                // usage statistics of the application and would appriciate if this behaviour is used.
                Bootstrap.Behaviour.GoogleAnalytics('UA-77062725-1')
            ],
            components: [
                Plugin.Components.Visualization.HighlightInfo(LayoutRegion.Main, true),

                //Plugin.Components.Context.Log(LayoutRegion.Bottom, true),
                Plugin.Components.create('PrankWeb.SequenceView', s => new PrankWeb.SequenceController(s), SequenceView)(LayoutRegion.Top, true),
                Plugin.Components.Context.Overlay(LayoutRegion.Root),
                Plugin.Components.Context.BackgroundTasks(LayoutRegion.Main, true)
            ],
            viewport: {
                view: Views.Visualization.Viewport,
                controlsView: Views.Visualization.ViewportControls
            },
            layoutView: Views.Layout, // nor this
            tree: { region: LayoutRegion.Left, view: Views.Entity.Tree }
        };

        let plugin = Plugin.create({ target, customSpecification: spec });
        plugin.context.logger.message(`LiteMol ${Plugin.VERSION.number}`);
        return plugin;
    }

    let appNode = document.getElementById('app')!

    let pocketNode = document.getElementById('pockets')!
    let pdbId: string = appNode.getAttribute("data-pdbid") !

    let plugin = create(appNode);

    LiteMol.Plugin.ReactDOM.render(LiteMol.Plugin.React.createElement(PocketList, {controller: new PocketController(plugin.context)}), pocketNode)

    let downloadAction = Bootstrap.Tree.Transform.build()
        .add(plugin.root, Transformer.Data.Download, { url: `/api/csv/${pdbId}`, type: 'String' }, { isHidden: true })
        .then(ParseAndCreatePrediction, {}, { ref: 'pockets', isHidden: true })
        .add(plugin.root, Transformer.Data.Download, { url: `/api/seq/${pdbId}`, type: 'String' }, { isHidden: true })
        .then(CreateSequence, {}, { ref: 'sequence', isHidden: true })
    plugin.applyTransform(downloadAction).then(() => {
        let pockets = (plugin.context.select('pockets')[0] as Prediction).props.pockets;
        let seqData = (plugin.context.select('sequence')[0] as Bootstrap.Entity.Data.String).props.data;
        LiteMol.Bootstrap.Command.Layout.SetState.dispatch(plugin.context, {
            isExpanded: false,
            hideControls: false
        });

        /**
         * Selection of a specific set of atoms...
         */
        let selectionQueries: Query.Builder[] = [];
        let allPocketIds: number[] = [];

        pockets.forEach((pocket: PrankPocket) => {
            selectionQueries.push(Query.atomsById.apply(null, pocket.surfAtomIds));
            pocket.surfAtomIds.forEach((id: number) => { allPocketIds.push(id) });

            // __LiteMolReact.__DOM.render(__LiteMolReact.createElement('p', {}, 'Ahoj'), pocketNode)   
        });


        let selectionColors = Bootstrap.Immutable.Map<string, Visualization.Color>()
            .set('Uniform', Visualization.Color.fromHex(0xff0000))
            .set('Selection', Visualization.Theme.Default.SelectionColor)
            .set('Highlight', Visualization.Theme.Default.HighlightColor);

        /**
         * Selection of the complement of the previous set.
         */
        let complementQ = Query.atomsById.apply(null, allPocketIds).complement();
        let complementColors = selectionColors.set('Uniform', Visualization.Color.fromHex(0x666666));
        let complementStyle: Bootstrap.Visualization.Molecule.Style<Bootstrap.Visualization.Molecule.SurfaceParams> = {
            type: 'Surface',
            params: { probeRadius: 0.5, density: 1.4, smoothing: 4, isWireframe: false },
            theme: { template: Bootstrap.Visualization.Molecule.Default.UniformThemeTemplate, colors: complementColors, transparency: { alpha: 1.0 } }
        };

        // Represent an action to perform on the app state.
        let action = Bootstrap.Tree.Transform.build();

        // This loads the model from PDBe
        let modelAction = action.add(plugin.context.tree.root, Transformer.Data.Download, { url: `/api/mmcif/${pdbId}`, type: 'String', description: pdbId })
            .then(Transformer.Data.ParseCif, { id: pdbId, description: pdbId }, { isBinding: true })
            .then(Transformer.Molecule.CreateFromMmCif, { blockIndex: 0 }, { isBinding: true })
            .then(Transformer.Molecule.CreateModel, { modelIndex: 0 }, { isBinding: false, ref: 'model' });

        // Create a selection on the model and then create a visual for it...
        modelAction
            .then(<any>Transformer.Molecule.CreateSelectionFromQuery, { query: complementQ, name: 'Protein', silent: true }, {})
            .then(<any>Transformer.Molecule.CreateVisual, { style: complementStyle }, { isHidden: true });

        selectionQueries.forEach((selectionQuery, i) => {
            let selectionColor = selectionColors.set('Uniform', pockets[i].color);
            let selectionStyle: Bootstrap.Visualization.Molecule.Style<Bootstrap.Visualization.Molecule.SurfaceParams> = {
                type: 'Surface',
                params: { probeRadius: 0.5, density: 1.25, smoothing: 3, isWireframe: false },
                theme: { template: Bootstrap.Visualization.Molecule.Default.UniformThemeTemplate, colors: selectionColor, transparency: { alpha: 0.5 } }
            };
            let sel = modelAction
                .then(Transformer.Molecule.CreateSelectionFromQuery, { query: selectionQuery, name: pockets[i].name, silent: true }, {})
            sel.then(<any>Transformer.Molecule.CreateVisual, { style: Bootstrap.Visualization.Molecule.Default.ForType.get('BallsAndSticks') }, { isHidden: true });
            sel.then(<any>Transformer.Molecule.CreateVisual, { style: selectionStyle }, { isHidden: true });
        });

        // to access the model after it was loaded...
        plugin.applyTransform(action).then(() => {
            let model = plugin.context.select('model')[0] as Bootstrap.Entity.Molecule.Model;
            if (!model) return;

            //Bootstrap.Command.Molecule.FocusQuery.dispatch(plugin.context, { model, query: selectionQueries });
        });
    });
}
