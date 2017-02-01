namespace LiteMol.PrankWeb {

    import Bootstrap = LiteMol.Bootstrap;
    import Entity = Bootstrap.Entity;
    import Transformer = Bootstrap.Entity.Transformer;

    export interface Sequence extends Entity<{ seq: string }> { }

    export const Sequence = Entity.create<{ seq: string }>({
        name: 'Protein sequence',
        typeClass: 'Data',
        shortName: 'PS',
        description: 'Represents sequence of the protein.'
    });

    export const CreateSequence = Bootstrap.Tree.Transformer.create<Bootstrap.Entity.Data.String, Sequence, {}>({
        id: 'protein-sequence-create',
        name: 'Protein sequence',
        description: 'Create protein sequence from string.',
        from: [Entity.Data.String],
        to: [Sequence],
        defaultParams: () => ({})
    }, (context, a, t) => {
        return Bootstrap.Task.create<Sequence>(`Create sequence entity`, 'Normal', async ctx => {
            await ctx.updateProgress('Creating sequence entity...');
            let seq = a.props.data
            console.log("Sekvence: " + seq)
            return Sequence.create(t, { label: 'Sequence', seq })
        }).setReportTime(true);
    }
    );

}