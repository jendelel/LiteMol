namespace LiteMol.PrankWeb.App {
    import React = LiteMol.Plugin.React;

    export function render(plugin: Plugin.Controller, inputType: string, inputId: string, target: HTMLElement) {
        LiteMol.Plugin.ReactDOM.render(
            <App plugin={plugin} inputType={inputType} inputId={inputId} />, target)
    }

    export class App extends React.Component<{plugin:Plugin.Controller, inputId:string, inputType:string},
        {isLoading?:boolean, error?:string, data?: DataLoader.PrankData }> {

        state = {isLoading:false, data: void 0, error: void 0};

        componentDidMount() {
            this.load();
        }

        load() {
            this.setState({isLoading: true, error: void 0});
            DataLoader.loadData(this.props.plugin, this.props.inputType,this.props.inputId)
                .then((val: {plugin:Plugin.Controller, data:DataLoader.PrankData})=>DataLoader.visualizeData(val.plugin, val.data))
                .then((data)=> this.setState({isLoading:false, data}))
                .catch((e)=> this.setState({isLoading:false, error:'' + e}));
        }
        
        render() {
            if(this.state.data) {
                // Data available, display pocket list.
                return <PocketList data={this.state.data!} plugin={this.props.plugin}/>
            } else {
                let controls : any[] = [];
                if (this.state.isLoading) {
                    controls.push(<h1>Loading...</h1>)
                } else {
                    // Offer a button to load data.
                    controls.push(<button onClick={()=>this.load()}>Load data</button>)
                    if (this.state.error) {
                        controls.push(<div style={{color: 'red', fontSize:'18px'}} >Error: {this.state.error}</div>)
                    }
                }
                return <div>{controls}</div>
            }
        }
    }

}