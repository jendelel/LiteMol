namespace LiteMol.PrankWeb {

    import Bootstrap = LiteMol.Bootstrap;
    import Entity = Bootstrap.Entity;
    import Transformer = Bootstrap.Entity.Transformer;

    export interface PrankPocket {
        name: string;
        rank: number;
        score: number;
        conollyPoints: number;
        surfAtoms: number;
        centerX: number;
        centerY: number;
        centerZ: number;
        residueIds: Array<number>
        surfAtomIds: Array<number>
        color: Visualization.Color;
    }

    export interface Prediction extends Entity<{ pockets: PrankPocket[] }> { }

    export const Prediction = Entity.create<{ pockets: PrankPocket[] }>({
        name: 'Pocket prediction',
        typeClass: 'Data',
        shortName: 'PP',
        description: 'Represents predicted protein-ligand binding pockets.'
    });

    export const ParseAndCreatePrediction = Bootstrap.Tree.Transformer.create<Bootstrap.Entity.Data.String, Prediction, {}>({
        id: 'protein-pocket-prediction-parse',
        name: 'Protein predicted pockets',
        description: 'Parse protein pocket prediction.',
        from: [Entity.Data.String],
        to: [Prediction],
        defaultParams: () => ({})
    }, (context, a, t) => {
        return Bootstrap.Task.create<Prediction>(`Parse protein prediction entity.`, 'Normal', async ctx => {
            await ctx.updateProgress('Parsing prediction data...');
            let csvData = a.props.data
            let result: Array<PrankPocket> = [];
            try {
                let lines: string[] = csvData.split('\n');
                let h: number = 0
                let HSVtoRGB = function (h: number, s: number, v: number) {
                    let r, g, b, i, f, p, q, t : number;
                    r=g=b=0
                    // if (arguments.length === 1) {
                    //     s = h.s, v = h.v, h = h.h;
                    // }
                    i = Math.floor(h * 6);
                    f = h * 6 - i;
                    p = v * (1 - s);
                    q = v * (1 - f * s);
                    t = v * (1 - (1 - f) * s);
                    switch (i % 6) {
                        case 0: r = v, g = t, b = p; break;
                        case 1: r = q, g = v, b = p; break;
                        case 2: r = p, g = v, b = t; break;
                        case 3: r = p, g = q, b = v; break;
                        case 4: r = t, g = p, b = v; break;
                        case 5: r = v, g = p, b = q; break;
                    }
                    console.log(r * 255, g * 255, b * 255)
                    return Visualization.Color.fromRgb(r * 255, g * 255, b * 255)
                }
                let colors: Array<Visualization.Color> = Array(6)
                colors[0] = Visualization.Color.fromHexString("#e74c3c")
                colors[1] = Visualization.Color.fromHexString("#00ffff")
                colors[2] = Visualization.Color.fromHexString("#2ecc71")
                colors[3] = Visualization.Color.fromHexString("#9b59b6")
                colors[4] = Visualization.Color.fromHexString("#00007f")
                colors[5] = Visualization.Color.fromHexString("#e67e22")

                for (let i = 1; i < lines.length; i++) {
                    // h = h + (1/6)
                    // if (h >= 1) { h = h-1 }

                    let fields = lines[i].split(',');
                    if (fields.length < 10)
                        continue;
                    let resIds: number[] = [];
                    fields[8].split(' ').forEach((value: string) => { resIds.push(parseInt(value)); })
                    let surfAtoms: number[] = [];
                    fields[9].split(' ').forEach((value: string) => { surfAtoms.push(parseInt(value)); })
                    result.push({
                        name: fields[0],
                        rank: parseFloat(fields[1]),
                        score: parseFloat(fields[2]),
                        conollyPoints: parseFloat(fields[3]),
                        surfAtoms: parseFloat(fields[4]),
                        centerX: parseFloat(fields[5]),
                        centerY: parseFloat(fields[6]),
                        centerZ: parseFloat(fields[7]),
                        residueIds: resIds,
                        surfAtomIds: surfAtoms,
                        color: colors[(i - 1) % 6]
                    })
                }
            } catch (e) {
                console.log("Exception catched during parsing.")
            }
            return Prediction.create(t, { label: 'Sequence', pockets: result })
        }).setReportTime(true);
    }
    );

}