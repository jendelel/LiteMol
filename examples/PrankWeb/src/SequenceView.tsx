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

        componentWillMount() {
            super.componentWillMount();
            //this.subscribe(Bootstrap.Event.Common.LayoutChanged.getStream(this.controller.context), () => this.scrollToBottom());
        }

        componentDidUpdate() {
            //this.scrollToBottom();
            let pockets = this.controller.latestState.pockets
            let pviz = getPviz();
            var seqEntry = new pviz.SeqEntry({ sequence: this.controller.latestState.seq });
            new pviz.SeqEntryAnnotInteractiveView({
                model: seqEntry, el: '#seqView',
                xChangeCallback: (pStart: number, pEnd: number) => {
                    // this.onLetterMouseEnter(Math.round(pStart));
                }
            }).render();

            let features: Array<Feature> = []
            pockets.forEach((pocket, i) => {
                pocket.residueIds.sort((a, b) => { return a - b })
                let lastStart = -1;
                let lastResNum = -1;
                pocket.residueIds.forEach((resNum, y) => {
                    if (y == 0) {
                        lastStart = resNum
                    } else {
                        if (lastResNum + 1 < resNum) {
                            features.push(new Feature("Pockets", `col${i % 6}`, lastStart, lastResNum, pocket.rank.toString()))
                            lastStart = resNum;
                        }
                    }
                    lastResNum = resNum
                })
                features.push(new Feature("Pockets", `col${i % 6}`, lastStart, lastResNum, pocket.rank.toString()))
            })

            let getColor = function (seqId: number) {
                let color = Visualization.Color.fromRgb(255, 255, 255);
                let colorSet: boolean = false
                pockets.forEach((pocket) => {
                    if (pocket.residueIds.indexOf(seqId) >= 0) {
                        if (!colorSet) {
                            color = pocket.color;
                            colorSet = true
                        } else {
                            console.log(seqId.toString() + " is in at least two pockets!");
                        }
                    }
                })
                return color;
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
            let seq = this.controller.latestState.seq.split('');
            let pockets = this.controller.latestState.pockets;
            let ctx = this.controller.context
            let seqToPrint: string[] = []
            seq.forEach((letter, i) => {
                seqToPrint.push(letter)
                if ((i + 1) % 10 == 0) {
                    seqToPrint.push(' ')
                }
            })

            let colorToString = function (color: Visualization.Color) {
                return 'rgb(' + (color.r * 255) + ',' + (color.g * 255) + ',' + (color.b * 255) + ')';
            }

            let seqId: number = -1;
            return <div id="seqView" className="noselect"></div>
            // return (<div className='protein-seq' style={{ fontFamily: 'Consolas, "Courier New", monospace', fontSize: 'large' }}>
            //     {seqToPrint.map((letter, i) => {
            //         if (letter === ' ') {
            //             return <span className="space"> </span>
            //         } else {
            //             seqId++
            //             return <span
            //                 id={'res' + seqId.toString()}
            //                 onMouseEnter={this.onLetterMouseEnter.bind(this, seqId, letter, true)}
            //                 onMouseLeave={this.onLetterMouseEnter.bind(this, seqId, letter, false)}
            //                 onClick={this.onLetterClick.bind(this, seqId, letter)}
            //                 style={{ color: colorToString(getColor(seqId)) }}
            //                 >{letter}</span>
            //         }
            //     })
            //     }
            // </div>);
        }
    }
}