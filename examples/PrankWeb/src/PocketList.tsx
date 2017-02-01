namespace LiteMol.PrankWeb {

    import Plugin = LiteMol.Plugin;
    import Query = LiteMol.Core.Structure.Query;
    import Views = Plugin.Views;
    import Bootstrap = LiteMol.Bootstrap;
    import React = LiteMol.Plugin.React; // this is to enable the HTML-like syntax

    export class PocketController extends Bootstrap.Components.Component<{ pockets: PrankPocket[] }> {

        constructor(context: Bootstrap.Context) {
            super(context, { pockets: [] });

            Bootstrap.Event.Tree.NodeAdded.getStream(context).subscribe(e => {
                if (e.data.type === Prediction) {
                    this.setState({ pockets: e.data.props.pockets });
                }
            })
        }
    }

    class CacheItem {
        constructor(query: Query.Builder, selectionInfo: Bootstrap.Interactivity.Molecule.SelectionInfo) {
            this.query = query
            this.selectionInfo = selectionInfo
        }
        query: Query.Builder
        selectionInfo: Bootstrap.Interactivity.Molecule.SelectionInfo
    }

    export class PocketList extends Views.View<PocketController, {}, {}> {

        getPocket(pocket: PrankPocket, model: Bootstrap.Entity.Molecule.Model) {
            let ctx = this.controller.context
            let cache = ctx.entityCache;
            let cacheId = `__pocketSelectionInfo-${pocket.name}`
            let item = cache.get<CacheItem>(model, cacheId);
            if (!item) {
                let selectionQ = Core.Structure.Query.atomsById.apply(null, pocket.surfAtomIds)//Core.Structure.Query.chains({ authAsymId: 'A' })
                let elements = Core.Structure.Query.apply(selectionQ, model.props.model).unionAtomIndices()
                let selection = Bootstrap.Interactivity.Info.selection(model, elements)
                let selectionInfo = Bootstrap.Interactivity.Molecule.transformInteraction(selection) !;
                item = new CacheItem(selectionQ, selectionInfo)
                cache.set(model, cacheId, item)
            }
            return item
        }

        componentWillMount() {
            super.componentWillMount();
            //this.subscribe(Bootstrap.Event.Common.LayoutChanged.getStream(this.controller.context), () => this.scrollToBottom());
        }

        componentDidUpdate() {
            //this.scrollToBottom();
        }

        onLetterMouseEnter(pocket: PrankPocket, isOn: boolean) {
            let ctx = this.controller.context;
            let model = ctx.select('model')[0] as Bootstrap.Entity.Molecule.Model;
            if (!model) return;

            // Get the sequence selection
            let pocketSel = this.getPocket(pocket, model)

            // Highlight in the 3D Visualization
            Bootstrap.Command.Molecule.Highlight.dispatch(ctx, { model: model, query: pocketSel.query, isOn: isOn })

            if (isOn) {
                 // Show tooltip
                 let label = Bootstrap.Interactivity.Molecule.formatInfo(pocketSel.selectionInfo)
                 Bootstrap.Event.Interactivity.Highlight.dispatch(ctx, [label, `${pocket.name}`])
             } else {
                 // Hide tooltip
                 Bootstrap.Event.Interactivity.Highlight.dispatch(ctx, [])
             }
        }

        onLetterClick(pocket: PrankPocket) {
            let ctx = this.controller.context;
            let model = ctx.select('model')[0] as Bootstrap.Entity.Molecule.Model;
            if (!model) return;

            let query = this.getPocket(pocket, model).query
            Bootstrap.Command.Molecule.FocusQuery.dispatch(ctx, { model, query })
        }

        render() {
            let pockets = this.controller.latestState.pockets;
            let ctx = this.controller.context

            let colorToString = function (color: Visualization.Color) {
                return 'rgb(' + (color.r * 255) + ',' + (color.g * 255) + ',' + (color.b * 255) + ')';
            }

            return (<div className="pocket-list">
                {pockets.map((pocket, i) => {
                    return <div className="pocket col-sm-6 col-xs-12" 
                                style={{ borderColor: colorToString(pocket.color) }} 
                                onMouseEnter={this.onLetterMouseEnter.bind(this, pocket, true)}
                                onMouseLeave={this.onLetterMouseEnter.bind(this, pocket, false)}
                                onClick={this.onLetterClick.bind(this, pocket)}
                                ><dl>
                        <dt>Pocket name</dt>
                        <dd>{pocket.name}</dd>
                        <dt>Pocket rank</dt>
                        <dd>{pocket.rank}</dd>
                        <dt>Pocket score</dt>
                        <dd>{pocket.score}</dd>
                    </dl></div>
                })}
            </div>);
        }
    }
}