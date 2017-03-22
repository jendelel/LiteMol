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
        indexMap: LiteMol.Core.Utils.FastMap<number, number>;
        lastNumber: number | undefined;
        lastMouseOverFeature: any | undefined;
        pVizSeqView: any = void 0;

        getResidue(seqIndex: number, model: Bootstrap.Entity.Molecule.Model) {
            let cacheId = `__resSelectionInfo-${seqIndex}`
            let result = this.getCacheItem(cacheId, model);
            if (!result) result = this.setCacheItem(cacheId, Core.Structure.Query.residuesById(seqIndex), model)
            return result;
        }

        getPocket(pocket: PrankPocket, model: Bootstrap.Entity.Molecule.Model) {
            let cacheId = `__resSelectionInfo-${pocket.name}-${pocket.rank}`
            let result = this.getCacheItem(cacheId, model);
            if (!result) result = this.setCacheItem(cacheId, Core.Structure.Query.atomsById.apply(null, pocket.surfAtomIds), model)
            return result;
        }

        setCacheItem(cacheId: string, query: Query.Builder, model: Bootstrap.Entity.Molecule.Model) {
            let cache = this.controller.context.entityCache;
            let elements = Core.Structure.Query.apply(query, model.props.model).unionAtomIndices();
            let selection = Bootstrap.Interactivity.Info.selection(model, elements)
            let selectionInfo = Bootstrap.Interactivity.Molecule.transformInteraction(selection) !;
            let item = new CacheItem(query, selectionInfo)
            cache.set(model, cacheId, item)
            return item;
        }

        getCacheItem(cacheId: string, model: Bootstrap.Entity.Molecule.Model) {
            let cache = this.controller.context.entityCache;
            let item = cache.get<CacheItem>(model, cacheId);
            if (!item) return void 0;
            return item;
        }

        addPocketFeatures(features: Feature[]) {
            this.indexMap = LiteMol.Core.Utils.FastMap.create<number, number>();
            // Build hashmap index->sequential index zero-based.
            this.controller.latestState.seq.indices.forEach((index, seqIndex) => {
                this.indexMap.set(index, seqIndex);
            })
            let pockets = this.controller.latestState.pockets;
            let pocketVisibility = this.controller.latestState.pocketVisibility;
            pockets.forEach((pocket, i) => {
                if (!pocketVisibility[i]) return; // Skip over invisible pockets.

                // Transform indices to sequential indices and then sort them
                let sortedIndices = pocket.residueIds.map((index) => this.indexMap.get(index) !)
                    .sort((a, b) => (a - b));
                let lastStart = -1;
                let lastResNum = -1;
                sortedIndices.forEach((resNum, y) => {
                    if (y == 0) {
                        lastStart = resNum;
                    } else {
                        if (lastResNum + 1 < resNum) {
                            features.push(new Feature("Pockets", `${pocket.name} col${i % 6}`, lastStart, lastResNum, pocket.rank.toString()))
                            lastStart = resNum;
                        }
                    }
                    lastResNum = resNum;
                })
                features.push(new Feature("Pockets", `${pocket.name} col${i % 6}`, lastStart, lastResNum, pocket.rank.toString()))
            });

        }

        componentDidMount() {
            this.subscribe(this.controller.state, state => {
                this.updatePViz();
            });
            this.initPViz();
        }

        componentDidUpdate() {
            this.updatePViz();
        }

        initPViz() {
            let seq = this.controller.latestState.seq;
            console.log(seq);
            if (seq.seq.length <= 0) return; // Sequence isn't loaded yet.
            let pviz = getPviz();
            let pockets = this.controller.latestState.pockets;

            this.pVizSeqView = new pviz.SeqEntry({ sequence: seq.seq.join("") });
            new pviz.SeqEntryAnnotInteractiveView({
                model: this.pVizSeqView, el: '#seqView',
                xChangeCallback: (pStart: number, pEnd: number) => {
                    this.onLetterMouseEnter(Math.round(pStart));
                }
            }).render();

            this.updatePViz();
        }

        updatePViz() {
            if (!this.pVizSeqView) this.initPViz();
            if (!this.pVizSeqView) return; // If something went wrong! 
            // Clear pViz features and callbacks.
            this.pVizSeqView.clear();
            let pViz = getPviz();
            pViz.FeatureDisplayer.mouseoverCallBacks = {};
            pViz.FeatureDisplayer.mouseoutCallBacks = {};

            let seq = this.controller.latestState.seq;
            if (seq.seq.length <= 0) return; // Sequence isn't loaded yet.

            let features: Array<Feature> = []
            this.addPocketFeatures(features); // Add pocket features.
            let pocketFeatureTypes = features.map((feature) => feature.type);

            // Add mouse callbacks.
            pViz.FeatureDisplayer.addMouseoverCallback(pocketFeatureTypes, (feature: any) => {
                this.selectAndDisplayToastPocket(this.lastMouseOverFeature, false);
                this.lastMouseOverFeature = this.parsePocketName(feature.type);
                this.selectAndDisplayToastPocket(this.lastMouseOverFeature, true);
            }).addMouseoutCallback(pocketFeatureTypes, (feature: any) => {
                this.selectAndDisplayToastPocket(this.lastMouseOverFeature, false);
                this.lastMouseOverFeature = void 0;
            });

            let scores = seq.scores;
            // Add conservation features.
            if (scores != null && scores.length >= 0) {
                scores.forEach((score, i) => {
                    let s = score >= 0 ? score : 0;
                    let s2 = (s * 10).toFixed(0); // There are 11 shades with selector score0, score1, ..., score10.
                    features.push(new Feature("Conservation", "score" + s2, i, i, s.toFixed(2)));
                });
            }
            this.pVizSeqView.addFeatures(features);
        }

        onLetterMouseEnter(seqNumber?: number) {
            if (this.lastNumber) {
                if (this.lastNumber != seqNumber) {
                    this.selectAndDisplayToastLetter(this.lastNumber, false);
                    this.selectAndDisplayToastLetter(seqNumber, true);
                }
            } else {
                this.selectAndDisplayToastLetter(seqNumber, true);
            }
            this.lastNumber = seqNumber;
        }

        selectAndDisplayToastLetter(seqNumber: number | undefined, isOn: boolean) {
            if (!seqNumber) return;
            let ctx = this.controller.context;
            let model = ctx.select('model')[0] as Bootstrap.Entity.Molecule.Model;
            if (!model) return;
            let map = this.indexMap;
            if (!map) return;
            let seqIndex = map.get(seqNumber);
            if (!seqIndex) return;

            // Get the sequence selection
            let seqSel = this.getResidue(seqIndex, model)

            // Highlight in the 3D Visualization
            Bootstrap.Command.Molecule.Highlight.dispatch(ctx, { model: model, query: seqSel.query, isOn })
            if (isOn) {
                // Show tooltip
                let label = Bootstrap.Interactivity.Molecule.formatInfo(seqSel.selectionInfo)
                Bootstrap.Event.Interactivity.Highlight.dispatch(ctx, [label/*, 'some additional label'*/])
            } else {
                // Hide tooltip
                Bootstrap.Event.Interactivity.Highlight.dispatch(ctx, [])
            }
        }

        parsePocketName(pocketFeatureType: string) {
            // Using the fact that * is greedy, so it will match everything up to and including the last space.
            let res = pocketFeatureType.match(".* ");
            if (!res) return void 0;
            let pocketName = res[0].trim();
            let pocketRes: PrankPocket | undefined = void 0;
            this.controller.latestState.pockets.forEach((pocket) => {
                if (pocket.name == pocketName) pocketRes = pocket;
            });
            return pocketRes;
        }

        selectAndDisplayToastPocket(pocket: PrankPocket | undefined, isOn: boolean) {
            if (!pocket) return;
            let ctx = this.controller.context;
            let model = ctx.select('model')[0] as Bootstrap.Entity.Molecule.Model;
            if (!model) return;

            // Get the pocket selection
            let seqSel = this.getPocket(pocket, model)

            // Highlight in the 3D Visualization
            Bootstrap.Command.Molecule.Highlight.dispatch(ctx, { model: model, query: seqSel.query, isOn })
            if (isOn) {
                // Show tooltip
                let label = Bootstrap.Interactivity.Molecule.formatInfo(seqSel.selectionInfo)
                Bootstrap.Event.Interactivity.Highlight.dispatch(ctx, [label/*, 'some additional label'*/])
            } else {
                // Hide tooltip
                Bootstrap.Event.Interactivity.Highlight.dispatch(ctx, [])
            }
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
            return <div id="seqView" className="noselect" onMouseLeave={() => { this.onLetterMouseEnter(void 0); }}></div>
        }
    }

    export class SequenceController extends Bootstrap.Components.Component<{ seq: Sequence, pockets: PrankPocket[], pocketVisibility: boolean[], version: number }> {
        constructor(context: Bootstrap.Context) {
            super(context, { seq: { indices: [], seq: [], scores: [] }, pockets: [], pocketVisibility: [], version: 0 });

            Bootstrap.Event.Tree.NodeAdded.getStream(context).subscribe(e => {
                if (e.data.type === SequenceEntity) {
                    this.setState({ seq: e.data.props.seq });
                } else if (e.data.type === Prediction) {
                    let pockets = e.data.props.pockets;
                    this.setState({ pockets, pocketVisibility: pockets.map(() => true) });
                }
            })

            // Subscribe to get updates about visibility of pockets.
            Bootstrap.Event.Tree.NodeUpdated.getStream(context).subscribe(e => {
                let entityRef = e.data.ref; // Pocket name whose visibility just changed.
                let pockets = this.latestState.pockets;
                let changed = false;
                let pocketVisibility = this.latestState.pocketVisibility;

                let i = 0;
                for (let pocket of pockets) {
                    if (pocket.name !== entityRef) {
                        i++;
                        continue;
                    }
                    // It should still be visible even if some children are invisible.
                    let visible = (e.data.state.visibility === Bootstrap.Entity.Visibility.Full || e.data.state.visibility === Bootstrap.Entity.Visibility.Partial);
                    if (pocketVisibility[i] !== visible) {
                        pocketVisibility[i] = visible;
                        changed = true;
                    }
                    break;
                }
                if (changed) {
                    // Keeping version field in the state, so that event about state update is fired. 
                    this.setState({ pockets, pocketVisibility, version: this.latestState.version + 1 });
                }
            });
        }
    }
}