namespace LiteMol.PrankWeb {
    import Plugin = LiteMol.Plugin;
    import Query = LiteMol.Core.Structure.Query;
    import Views = Plugin.Views;
    import Bootstrap = LiteMol.Bootstrap;
    import React = LiteMol.Plugin.React; // this is to enable the HTML-like syntax


    export class ControlButtons extends React.Component<{ inputType : string, inputId: string }, {}> {

        render() {
            let type : string = this.props.inputType == "pdb" ? "id" : "upload";
            let downloadUrl = `/api/${type}/zip/${this.props.inputId}`;
            let mail = `mailto:?subject=PrankWeb&amp;body=Hello`
            return (<div className="control-buttons">
                <h2 className="text-center">Tools</h2>
                <button className="control-btn" title="Download report" onClick={()=>{window.open(downloadUrl,'_blank');}}><span className="button-icon download-icon"/></button>
                <button className="control-btn" title="Send via e-mail" onClick={()=>{window.open(mail,'_blank');}}><span className="button-icon share-icon"/></button>
            </div>);
        }
    }
}