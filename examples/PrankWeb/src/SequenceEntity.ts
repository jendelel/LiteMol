namespace LiteMol.PrankWeb {

    import Bootstrap = LiteMol.Bootstrap;
    import Entity = Bootstrap.Entity;
    import Transformer = Bootstrap.Entity.Transformer;

    export interface Sequence {
        indices: number[]
        seq: string[]
        scores: number[]
     }

    export interface SequenceEntity extends Entity<{ seq: Sequence }> { }

    export const SequenceEntity = Entity.create<{ seq: Sequence }>({
        name: 'Protein sequence',
        typeClass: 'Data',
        shortName: 'PS',
        description: 'Represents sequence of the protein.'
    });

    export const CreateSequence = Bootstrap.Tree.Transformer.create<Bootstrap.Entity.Data.Json, SequenceEntity, {}>({
        id: 'protein-sequence-create',
        name: 'Protein sequence',
        description: 'Create protein sequence from string.',
        from: [Entity.Data.Json],
        to: [SequenceEntity],
        defaultParams: () => ({})
    }, (context, a, t) => {
        return Bootstrap.Task.create<SequenceEntity>(`Create sequence entity`, 'Normal', async ctx => {
            await ctx.updateProgress('Creating sequence entity...');
            return SequenceEntity.create(t, { label: 'Sequence', seq: a.props.data as Sequence })
        }).setReportTime(true);
    }
    );

}