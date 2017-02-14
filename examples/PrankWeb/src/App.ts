namespace LiteMol.PrankWeb {

    import Plugin = LiteMol.Plugin;
    import Query = LiteMol.Core.Structure.Query;
    import Views = Plugin.Views;
    import Bootstrap = LiteMol.Bootstrap;
    import Transformer = Bootstrap.Entity.Transformer;
    import LayoutRegion = Bootstrap.Components.LayoutRegion;

    export function create(target: HTMLElement) {
        let plugin = Plugin.create({
            target,
            // viewportBackground: '#333',
            layoutState: {
                hideControls: false, 
                isExpanded: false,
            },
            customSpecification: PrankWebSpec
        });
        plugin.context.logger.message(`LiteMol ${Plugin.VERSION.number}`);
        return plugin;
    }

    let appNode = document.getElementById('app') !
    let pocketNode = document.getElementById('pockets') !
    let inputType: string = appNode.getAttribute("data-input-type") !
    let inputId: string = appNode.getAttribute("data-input-id") !
    App.render(create(appNode), inputType, inputId, pocketNode);
}
