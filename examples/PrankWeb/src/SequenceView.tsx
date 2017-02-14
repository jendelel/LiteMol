namespace LiteMol.PrankWeb {

    import Plugin = LiteMol.Plugin;
    import Query = LiteMol.Core.Structure.Query;
    import Views = Plugin.Views;
    import Bootstrap = LiteMol.Bootstrap;
    import React = LiteMol.Plugin.React; // this is to enable the HTML-like syntax
    declare var getPviz: any;

    class CacheItem {
        constructor(query: Query.Builder, selectionInfo: Bootstrap.Interactivity.Molecule.SelectionInfo) {
            this.query = query
            this.selectionInfo = selectionInfo
        }
        query: Query.Builder
        selectionInfo: Bootstrap.Interactivity.Molecule.SelectionInfo
    }

    class Feature {
        constructor(cat: string, typ: string, start: number, end: number, text: string) {
            this.category = cat;
            this.type = typ;
            this.start = start;
            this.end = end;
            this.text = text;
        }
        category: string
        type: string
        start: number
        end: number
        text: string
    }

    export class SequenceView extends Views.View<SequenceController, {}, {}> {

        getResidue(seqNumber: number, model: Bootstrap.Entity.Molecule.Model) {
            let ctx = this.controller.context
            let cache = ctx.entityCache;
            let cacheId = `__resSelectionInfo-${seqNumber}`
            let item = cache.get<CacheItem>(model, cacheId);
            if (!item) {
                let selectionQ = Core.Structure.Query.residuesById(seqNumber)//Core.Structure.Query.chains({ authAsymId: 'A' })
                let elements = Core.Structure.Query.apply(selectionQ, model.props.model).unionAtomIndices();
                let selection = Bootstrap.Interactivity.Info.selection(model, elements)
                let selectionInfo = Bootstrap.Interactivity.Molecule.transformInteraction(selection) !;
                item = new CacheItem(selectionQ, selectionInfo)
                cache.set(model, cacheId, item)
            }
            return item
        }

        addPocketFeatures(features: Feature[]) {
            let map = LiteMol.Core.Utils.FastMap.create<number, number>();
            // Build hashmap index->sequential index zero-based.
            this.controller.latestState.seq.indices.forEach((index, seqIndex) => {
                map.set(index, seqIndex);
            })
            let pockets = this.controller.latestState.pockets;
            pockets.forEach((pocket, i) => {
                // Transform indices to sequential indices and then sort them
                let sortedIndices = pocket.residueIds.map((index) => map.get(index) !)
                    .sort((a, b) => (a - b));
                let lastStart = -1;
                let lastResNum = -1;
                sortedIndices.forEach((resNum, y) => {
                    if (y == 0) {
                        lastStart = resNum;
                    } else {
                        if (lastResNum + 1 < resNum) {
                            features.push(new Feature("Pockets", `pocket${i} col${i % 6}`, lastStart, lastResNum, pocket.rank.toString()))
                            lastStart = resNum;
                        }
                    }
                    lastResNum = resNum;
                })
                features.push(new Feature("Pockets", `pocket${pockets.length - 1} col${i % 6}`, lastStart, lastResNum, pocket.rank.toString()))
            });

        }

        componentDidMount() {
            this.componentDidUpdate();
        }

        componentDidUpdate() {
            let seq = this.controller.latestState.seq;
            if (seq.seq.length <= 0) return; // Sequence isn't loaded yet.
            let pviz = getPviz();
            let pockets = this.controller.latestState.pockets;
            var seqEntry = new pviz.SeqEntry({ sequence: seq.seq.join("") });
            new pviz.SeqEntryAnnotInteractiveView({
                model: seqEntry, el: '#seqView',
                xChangeCallback: (pStart: number, pEnd: number) => {
                    // this.onLetterMouseEnter(Math.round(pStart));
                }
            }).render();

            let features: Array<Feature> = []
            this.addPocketFeatures(features);
            let scores = seq.scores;
            // Add conservation features.
            if (scores != null && scores.length >= 0) {
                scores.forEach((score, i) => {
                    let s = score >= 0 ? score : 0;
                    let s2 = Math.round(s * 10); // There are 11 shades of gray with selector score0, score1, ..., score10.
                    features.push(new Feature("Conservation", "score" + s2, i, i, (Math.round(s * 100) / 100).toString()));
                });
            }
            seqEntry.addFeatures(features);
        }

        lastSelectedSeq: CacheItem;
        onLetterMouseEnter(seqNumber: number) {
            let ctx = this.controller.context;
            let model = ctx.select('model')[0] as Bootstrap.Entity.Molecule.Model;
            if (!model) return;

            // Get the sequence selection
            let seqSel = this.getResidue(seqNumber, model)

            // Highlight in the 3D Visualization
            if (this.lastSelectedSeq) {
                Bootstrap.Command.Molecule.Highlight.dispatch(ctx, { model: model, query: this.lastSelectedSeq.query, isOn: false })
            }
            Bootstrap.Command.Molecule.Highlight.dispatch(ctx, { model: model, query: seqSel.query, isOn: true })
            this.lastSelectedSeq = seqSel
            // if (isOn) {
            // Show tooltip
            let label = Bootstrap.Interactivity.Molecule.formatInfo(seqSel.selectionInfo)
            Bootstrap.Event.Interactivity.Highlight.dispatch(ctx, [label/*, 'some additional label'*/])
            // } else {
            // Hide tooltip
            // Bootstrap.Event.Interactivity.Highlight.dispatch(ctx, [])
            // }
        }

        onLetterClick(seqNumber: number, letter: string) {
            let ctx = this.controller.context;
            let model = ctx.select('model')[0] as Bootstrap.Entity.Molecule.Model;
            if (!model) return;

            let query = this.getResidue(seqNumber, model).query
            Bootstrap.Command.Molecule.FocusQuery.dispatch(ctx, { model, query })
        }

        render() {
            let seqId: number = -1;
            return <div id="seqView" className="noselect"></div>
        }
    }

    export class SequenceController extends Bootstrap.Components.Component<{ seq: Sequence, pockets: PrankPocket[] }> {

        constructor(context: Bootstrap.Context) {
            super(context, { seq: { indices: [], seq: [], scores: [] }, pockets: [] });

            Bootstrap.Event.Tree.NodeAdded.getStream(context).subscribe(e => {
                if (e.data.type === SequenceEntity) {
                    this.setState({ seq: e.data.props.seq, pockets: this.latestState.pockets });
                } else if (e.data.type === Prediction) {
                    this.setState({ seq: this.latestState.seq, pockets: e.data.props.pockets });
                }
            })
        }
    }
}