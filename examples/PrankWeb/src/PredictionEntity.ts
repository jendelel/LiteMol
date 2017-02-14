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
    }

    export const Colors = Bootstrap.Immutable.List.of(
        Visualization.Color.fromHexString("#e74c3c"),
        Visualization.Color.fromHexString("#00ffff"),
        Visualization.Color.fromHexString("#2ecc71"),
        Visualization.Color.fromHexString("#9b59b6"),
        Visualization.Color.fromHexString("#00007f"),
        Visualization.Color.fromHexString("#e67e22"))

    export interface Prediction extends Entity<{ pockets: PrankPocket[] }> { }

    export const Prediction = Entity.create<{ pockets: PrankPocket[] }>({
        name: 'Pocket prediction',
        typeClass: 'Data',
        shortName: 'PP',
        description: 'Represents predicted protein-ligand binding pockets.'
    });

    export const ParseAndCreatePrediction = Bootstrap.Tree.Transformer.create<Bootstrap.Entity.Data.Json, Prediction, {}>({
        id: 'protein-pocket-prediction-parse',
        name: 'Protein predicted pockets',
        description: 'Parse protein pocket prediction.',
        from: [Entity.Data.Json],
        to: [Prediction],
        defaultParams: () => ({})
    }, (context, a, t) => {
        return Bootstrap.Task.create<Prediction>(`Create protein prediction entity.`, 'Normal', async ctx => {
            await ctx.updateProgress('Creating prediction data...');
            return Prediction.create(t, { label: 'Sequence', pockets: (a.props.data as PrankPocket[]) })
        }).setReportTime(true);
    }
    );

}