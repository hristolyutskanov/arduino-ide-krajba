import * as React from 'react';
import * as dateFormat from 'dateformat';
import { postConstruct, injectable, inject } from 'inversify';
import { ThemeConfig } from 'react-select/src/theme';
import { OptionsType } from 'react-select/src/types';
import Select from 'react-select';
import { Styles } from 'react-select/src/styles';
import { ReactWidget, Message, Widget } from '@theia/core/lib/browser/widgets';
import { MonitorConfig } from '../../common/protocol/monitor-service';
import { MonitorModel } from './monitor-model';
import { MonitorConnection } from './monitor-connection';
import { MonitorServiceClientImpl } from './monitor-service-client-impl';

@injectable()
export class MonitorWidget extends ReactWidget {

    static readonly ID = 'serial-monitor';

    @inject(MonitorModel)
    protected readonly model: MonitorModel;

    @inject(MonitorConnection)
    protected readonly monitorConnection: MonitorConnection;

    @inject(MonitorServiceClientImpl)
    protected readonly monitorServiceClient: MonitorServiceClientImpl;

    protected lines: string[];
    protected chunk: string;
    protected widgetHeight: number;

    /**
     * Do not touch or use it. It is for setting the focus on the `input` after the widget activation.
     */
    protected focusNode: HTMLElement | undefined;

    constructor() {
        super();

        this.id = MonitorWidget.ID;
        this.title.label = 'Serial Monitor';
        this.title.iconClass = 'arduino-serial-monitor-tab-icon';

        this.lines = [];
        this.chunk = '';
        this.scrollOptions = undefined;
    }

    @postConstruct()
    protected init(): void {
        this.toDisposeOnDetach.pushAll([
            this.monitorServiceClient.onRead(({ data }) => {
                this.chunk += data;
                const eolIndex = this.chunk.indexOf('\n');
                if (eolIndex !== -1) {
                    const line = this.chunk.substring(0, eolIndex + 1);
                    this.chunk = this.chunk.slice(eolIndex + 1);
                    this.lines.push(`${this.model.timestamp ? `${dateFormat(new Date(), 'H:M:ss.l')} -> ` : ''}${line}`);
                    this.update();
                }
            }),
            this.monitorConnection.onConnectionChanged(state => {
                if (!state) {
                    this.clearConsole();
                }
            })
        ]);
        this.update();
    }

    clearConsole(): void {
        this.chunk = '';
        this.lines = [];
        this.update();
    }

    onBeforeAttach(msg: Message): void {
        super.onBeforeAttach(msg);
        this.clearConsole();
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.monitorConnection.autoConnect = true;
    }

    protected onBeforeDetach(msg: Message): void {
        super.onBeforeDetach(msg);
        this.monitorConnection.autoConnect = false;
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.widgetHeight = msg.height;
        this.update();
    }

    protected get lineEndings(): OptionsType<SelectOption<MonitorModel.EOL>> {
        return [
            {
                label: 'No Line Ending',
                value: ''
            },
            {
                label: 'Newline',
                value: '\n'
            },
            {
                label: 'Carriage Return',
                value: '\r'
            },
            {
                label: 'Both NL & CR',
                value: '\r\n'
            }
        ]
    }

    protected get baudRates(): OptionsType<SelectOption<MonitorConfig.BaudRate>> {
        const baudRates: Array<MonitorConfig.BaudRate> = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
        return baudRates.map(baudRate => ({ label: baudRate + ' baud', value: baudRate }));
    }

    protected render(): React.ReactNode {
        const { baudRates, lineEndings } = this;
        const lineEnding = lineEndings.find(item => item.value === this.model.lineEnding) || lineEndings[1]; // Defaults to `\n`.
        const baudRate = baudRates.find(item => item.value === this.model.baudRate) || baudRates[4]; // Defaults to `9600`.
        return <div className='serial-monitor-container'>
            <div className='head'>
                <div className='send'>
                    <SerialMonitorSendField onSend={this.onSend} />
                </div>
                <div className='config'>
                    {this.renderSelectField('arduino-serial-monitor-line-endings', lineEndings, lineEnding, this.onChangeLineEnding)}
                    {this.renderSelectField('arduino-serial-monitor-baud-rates', baudRates, baudRate, this.onChangeBaudRate)}
                </div>
            </div>
            <div id='serial-monitor-output-container'>
                <SerialMonitorOutput model={this.model} lines={this.lines} />
            </div>
        </div>;
    }

    protected readonly onSend = (value: string) => this.doSend(value);
    protected async doSend(value: string): Promise<void> {
        this.monitorConnection.send(value);
    }

    protected readonly onChangeLineEnding = (option: SelectOption<MonitorModel.EOL>) => {
        this.model.lineEnding = option.value;
    }

    protected readonly onChangeBaudRate = async (option: SelectOption<MonitorConfig.BaudRate>) => {
        await this.monitorConnection.disconnect();
        this.model.baudRate = option.value;
    }

    protected renderSelectField<T>(
        id: string,
        options: OptionsType<SelectOption<T>>,
        defaultValue: SelectOption<T>,
        onChange: (option: SelectOption<T>) => void): React.ReactNode {

        const height = 25;
        const styles: Styles = {
            control: (styles, state) => ({
                ...styles,
                width: 200,
                color: 'var(--theia-ui-font-color1)'
            }),
            dropdownIndicator: styles => ({
                ...styles,
                padding: 0
            }),
            indicatorSeparator: () => ({
                display: 'none'
            }),
            indicatorsContainer: () => ({
                padding: '0px 5px'
            }),
            menu: styles => ({
                ...styles,
                marginTop: 0
            })
        };
        const theme: ThemeConfig = theme => ({
            ...theme,
            borderRadius: 0,
            spacing: {
                controlHeight: height,
                baseUnit: 2,
                menuGutter: 4
            }
        });
        const DropdownIndicator = () => {
            return (
                <span className='fa fa-caret-down caret'></span>
            );
        };
        return <Select
            options={options}
            defaultValue={defaultValue}
            onChange={onChange}
            components={{ DropdownIndicator }}
            theme={theme}
            styles={styles}
            maxMenuHeight={this.widgetHeight - 40}
            classNamePrefix='sms'
            className='serial-monitor-select'
            id={id}
            isSearchable={false}
        />
    }
}


export namespace SerialMonitorSendField {
    export interface Props {
        readonly onSend: (text: string) => void
    }
    export interface State {
        value: string;
    }
}

export class SerialMonitorSendField extends React.Component<SerialMonitorSendField.Props, SerialMonitorSendField.State> {

    protected inputField: HTMLInputElement | null;

    constructor(props: SerialMonitorSendField.Props) {
        super(props);
        this.state = { value: '' };

        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    componentDidMount() {
        if (this.inputField) {
            this.inputField.focus();
        }
    }

    render() {
        return <React.Fragment>
            <input
                tabIndex={-1}
                ref={ref => this.inputField = ref}
                type='text' id='serial-monitor-send'
                autoComplete='off'
                value={this.state.value}
                onChange={this.handleChange} />
            <button className='button' onClick={this.handleSubmit}>Send</button>
            {/* <input className='btn' type='submit' value='Submit' />
            <form onSubmit={this.handleSubmit}>
            </form> */}
        </React.Fragment>
    }

    protected handleChange(event: React.ChangeEvent<HTMLInputElement>) {
        this.setState({ value: event.target.value });
    }

    protected handleSubmit(event: React.MouseEvent<HTMLButtonElement>) {
        this.props.onSend(this.state.value);
        this.setState({ value: '' });
        event.preventDefault();
    }
}

export namespace SerialMonitorOutput {
    export interface Props {
        readonly lines: string[];
        readonly model: MonitorModel;
    }
}

export class SerialMonitorOutput extends React.Component<SerialMonitorOutput.Props> {

    protected anchor: HTMLElement | null;

    render() {
        return <React.Fragment>
            <div style={({ whiteSpace: 'pre', fontFamily: 'monospace' })}>
                {this.props.lines.join('')}
            </div>
            <div style={{ float: 'left', clear: 'both' }} ref={element => { this.anchor = element; }} />
        </React.Fragment>;
    }

    componentDidMount() {
        this.scrollToBottom();
    }

    componentDidUpdate() {
        this.scrollToBottom();
    }

    protected scrollToBottom() {
        if (this.props.model.autoscroll && this.anchor) {
            this.anchor.scrollIntoView();
        }
    }

}

export interface SelectOption<T> {
    readonly label: string;
    readonly value: T;
}
