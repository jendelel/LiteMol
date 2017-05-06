namespace LiteMol.PrankWeb {

    import Plugin = LiteMol.Plugin;
    import Query = LiteMol.Core.Structure.Query;
    import Views = Plugin.Views;
    import Bootstrap = LiteMol.Bootstrap;
    import React = LiteMol.Plugin.React; // this is to enable the HTML-like syntax
    declare var createProtael: any;

    class CacheItem {
        constructor(query: Query.Builder, selectionInfo: Bootstrap.Interactivity.Molecule.SelectionInfo) {
            this.query = query
            this.selectionInfo = selectionInfo
        }
        query: Query.Builder
        selectionInfo: Bootstrap.Interactivity.Molecule.SelectionInfo
    }

    class ProtaelFeature {
        constructor(regionType: string, color: string, start: number, end: number, label: string, properties: any) {
            this.regionType = regionType;
            this.color = color;
            this.start = start;
            this.end = end;
            this.label = label;
            this.properties = properties;
        }
        regionType: string
        color: string
        start: number
        end: number
        label: string
        properties: any
    }

    class ProtaelRegion {
        constructor(label: string, start: number, end: number) {
            this.label = label;
            this.start = start;
            this.end = end;
        }
        label: string;
        start: number;
        end: number;
        color: string = "#DDD";
        regionType: string = "Chain"
    }

    class ProtaelContent {
        constructor(seq: string, pocketFeatures: ProtaelFeature[], chains: ProtaelRegion[], conservationScores: number[], bindingSites: ProtaelFeature[]) {
            this.sequence = seq;
            this.ftracks = [{ label: "Pockets", color: "blue", showLine: false, allowOverlap: false, features: pocketFeatures }]
            this.overlayfeatures = { label: "Chains", features: chains };
            if (conservationScores != null && conservationScores.length > 0) {
                this.qtracks = [{ label: "Evolutionary conservation", color: "gray", type: "column", values: conservationScores }]
            }
            if (bindingSites != null && bindingSites.length > 0) {
                this.ftracks.push({ label: "Binding sites", color: "purple", showLine: false, allowOverlap: false, features: bindingSites });
            }
        }
        sequence: string;
        ftracks: Array<{ label: string, color: string, showLine: boolean, allowOverlap: boolean, features: Array<ProtaelFeature> }>
        overlayfeatures: { label: string, features: Array<ProtaelRegion> }
        qtracks: Array<{ label: string, color: string, type: string, values: number[] }> = []
    }

    export class SequenceView extends Views.View<SequenceController, {}, {}> {
        indexMap: LiteMol.Core.Utils.FastMap<string, number>;
        lastNumber: number | undefined;
        lastMouseOverFeature: any | undefined;
        protaelView: any = void 0;
        subscriptionHandle : Bootstrap.Rx.IDisposable

        getResidue(seqIndex: number, model: Bootstrap.Entity.Molecule.Model) {
            let cacheId = `__resSelectionInfo-${seqIndex}`
            let result = this.getCacheItem(cacheId, model);
            if (!result) {
                let pdbResIndex = this.controller.latestState.seq.indices[seqIndex];
                result = this.setCacheItem(cacheId, DataLoader.residuesBySeqNums(pdbResIndex), model)
            }
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
            let selectionInfo = Bootstrap.Interactivity.Molecule.transformInteraction(selection)!;
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

        indicesToSequenceSegments(sortedIndices: number[]) {
            let result: { start: number, end: number }[] = [];
            // Transform indices to sequential indices and then sort them
            let lastStart = -1;
            let lastResNum = -1;
            sortedIndices.forEach((resNum, y) => {
                if (y == 0) {
                    lastStart = resNum;
                } else {
                    if (lastResNum + 1 < resNum) {
                        result.push({ start: lastStart, end: lastResNum });
                        lastStart = resNum;
                    }
                }
                lastResNum = resNum;
            })
            result.push({ start: lastStart, end: lastResNum });
            return result;
        }

        addPocketFeatures(features: ProtaelFeature[]) {
            this.indexMap = LiteMol.Core.Utils.FastMap.create<string, number>();
            // Build hashmap index->sequential index one-based.
            this.controller.latestState.seq.indices.forEach((index, seqIndex) => {
                this.indexMap.set(index, seqIndex + 1);
            })
            let pockets = this.controller.latestState.pockets;
            let pocketVisibility = this.controller.latestState.pocketVisibility;
            pockets.forEach((pocket, i) => {
                if (!pocketVisibility[i]) return; // Skip over invisible pockets.

                let sortedIndices = pocket.residueIds.map((index) => this.indexMap.get(index)!)
                    .sort((a, b) => (a - b));
                let segments = this.indicesToSequenceSegments(sortedIndices);
                for (const s of segments) {
                    let c = Colors.get(i % Colors.size);
                    features.push(new ProtaelFeature("Pockets", `rgb(${c.r * 255}, ${c.g * 255}, ${c.b * 255})`, s.start, s.end, pocket.rank.toString(), { "Pocket name": pocket.name }))
                }
            });
        }

        getBindingSites() {
            let result: ProtaelFeature[] = [];
            let sites = this.controller.latestState.seq.bindingSites;
            if (sites && sites.length > 0) {
                let sortedIndices = sites.sort((a, b) => (a - b));
                let segments = this.indicesToSequenceSegments(sortedIndices);
                for (const s of segments) {
                    result.push(new ProtaelFeature("Binding site", "purple", s.start, s.end, "", void 0));
                }
            }
            return result;
        }

        getChainRegions() {
            let result: ProtaelRegion[] = [];
            this.controller.latestState.seq.regions.forEach((region, i) => {
                result.push(new ProtaelRegion(`Chain ${region.regionName}`, region.start + 1, region.end + 1));
            });
            return result;
        }

        componentDidMount() {
            this.subscriptionHandle = this.subscribe(this.controller.state, state => {
                this.updateProtael();
            });
            this.updateProtael();
        }

        componentWillUnmount() {
            this.unsubscribe(this.subscriptionHandle)
            if (this.protaelView) {
                try {
                    let el = document.getElementsByClassName("protael_resizable").item(0)
                    el.parentNode!.removeChild(el);
                } catch (err) {
                    console.log(`Unable to remove Protael, ${err}`);
                }
            }
            this.fixProtaelHeight(true);
        }

        componentDidUpdate() {
            this.updateProtael();
        }

        createProtelContent() {
            let seq = this.controller.latestState.seq;
            console.log(seq);
            if (seq.seq.length <= 0) return void 0; // Sequence isn't loaded yet.
            let features: Array<ProtaelFeature> = []
            this.addPocketFeatures(features); // Add pocket features.
            let chainRegions = this.getChainRegions();
            let bindingSites = this.getBindingSites();

            return new ProtaelContent(seq.seq.join(""), features, chainRegions, seq.scores, bindingSites);
        }

        updateProtael() {
            let protaelContent = this.createProtelContent();
            if (!protaelContent) return;

            if (this.protaelView) {
                try {
                    let el = document.getElementsByClassName("protael_resizable").item(0)
                    el.parentNode!.removeChild(el);
                } catch (err) {
                    console.log(`Unable to remove Protael, ${err}`);
                }
            }
            let seqViewEl = document.getElementById("seqView");
            if (!seqViewEl) {
                console.log("No seqView element!");
            }

            this.protaelView = createProtael(protaelContent, "seqView", true);
            this.protaelView.draw();
            this.protaelView.onMouseOver((e: any) => {
                if (e.offsetX == 0) return;
                let seqNum = this.protaelView.toOriginalX(e.offsetX);
                this.onLetterMouseEnter(seqNum)
            });
            this.fixProtaelHeight();

            // pViz.FeatureDisplayer.mouseoverCallBacks = {};
            // pViz.FeatureDisplayer.mouseoutCallBacks = {};

            // Add mouse callbacks.
            /*
            pViz.FeatureDisplayer.addMouseoverCallback(pocketFeatureLabels, (feature: any) => {
                this.selectAndDisplayToastPocket(this.lastMouseOverFeature, false);
                this.lastMouseOverFeature = this.parsePocketName(feature.type);
                this.selectAndDisplayToastPocket(this.lastMouseOverFeature, true);
            }).addMouseoutCallback(pocketFeatureLabels, (feature: any) => {
                this.selectAndDisplayToastPocket(this.lastMouseOverFeature, false);
                this.lastMouseOverFeature = void 0;
            });
            */
        }

        forEachNodeInSelector(elemets: NodeListOf<Element>, fnc: (el: HTMLElement, i?: number) => void) {
            for (let i: number = 0; i < elemets.length; i++) {
                let el = elemets.item(i) as HTMLElement;
                if (!el) continue;
                fnc(el, i);
            }
        }

        fixProtaelHeight(clear : boolean = false) {
            let protael = document.getElementById('seqView');
            if (!protael && !clear) return;
            let height = !clear ? protael!.scrollHeight.toString().concat("px") : null;
            let minusHeight = !clear ?  "-".concat(protael!.scrollHeight.toString().concat("px")) : null;
            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-standard-outside .lm-layout-top"),
                el => { el.style.height = height; el.style.top = minusHeight });
            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-standard-outside .lm-layout-bottom"),
                el => { el.style.height = height; el.style.top = minusHeight });

            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-standard-landscape .lm-layout-main"),
                el => { el.style.top = height; });
            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-standard-landscape .lm-layout-top"),
                el => { el.style.height = height; });

            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-standard-portrait .lm-layout-main"),
                el => { el.style.top = height; });
            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-standard-portrait .lm-layout-top"),
                el => { el.style.height = height; });
            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-standard-portrait .lm-layout-bottom"),
                el => { el.style.height = height; });

            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-expanded .lm-layout-main"),
                el => { el.style.top = height; });
            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-expanded .lm-layout-top"),
                el => { el.style.height = height; });
            this.forEachNodeInSelector(document.querySelectorAll(".lm-plugin .lm-layout-expanded .lm-layout-bottom"),
                el => { el.style.height = height; });

            this.controller.context.scene.scene.resized();
        }

        onLetterMouseEnter(seqNumber?: number) {
            if (!seqNumber && seqNumber != 0) return;
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

        // Displays/Hides toast for given residue. SeqNumber is ***zero-based index*** of the residue.
        selectAndDisplayToastLetter(seqNumber: number | undefined, isOn: boolean) {
            if ((!seqNumber && seqNumber != 0) || seqNumber < 0) return;
            let ctx = this.controller.context;
            let model = ctx.select('model')[0] as Bootstrap.Entity.Molecule.Model;
            if (!model) return;

            // Get the sequence selection
            let seqSel = this.getResidue(seqNumber, model)

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
            return <div id="seqView" className="noselect" onMouseLeave={() => { this.onLetterMouseEnter(void 0); }} />
        }
    }

    export class SequenceController extends Bootstrap.Components.Component<{ seq: Sequence, pockets: PrankPocket[], pocketVisibility: boolean[], version: number }> {
        constructor(context: Bootstrap.Context) {
            super(context, { seq: { indices: [], seq: [], scores: [], bindingSites: [], regions: [] }, pockets: [], pocketVisibility: [], version: 0 });

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