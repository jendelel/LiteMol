namespace LiteMol.PrankWeb {

    import Plugin = LiteMol.Plugin;
    import Query = LiteMol.Core.Structure.Query;
    import Views = Plugin.Views;
    import Bootstrap = LiteMol.Bootstrap;

    export class SequenceController extends Bootstrap.Components.Component<{ seq: string, pockets : PrankPocket[] }> {

        constructor(context: Bootstrap.Context) {
            super(context, { seq: "", pockets: []});

            Bootstrap.Event.Tree.NodeAdded.getStream(context).subscribe(e=>{
                if (e.data.type === Sequence) {
                    this.setState({seq: e.data.props.seq, pockets: this.latestState.pockets});
                } else if (e.data.type === Prediction) {
                    this.setState({seq: this.latestState.seq, pockets: e.data.props.pockets});
                }
            })
        }
    }
}