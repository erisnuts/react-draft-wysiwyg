/* @flow */

import React, { Component, PropTypes } from 'react';
import {
  Editor,
  EditorState,
  RichUtils,
  convertToRaw,
  convertFromRaw,
  RawDraftContentState,
  CompositeDecorator,
  DefaultDraftBlockRenderMap,
} from 'draft-js';
import {
  changeDepth,
  handleNewLine,
  customStyleMap,
} from 'draftjs-utils';
import { Map } from 'immutable';
import classNames from 'classnames';
import ModalHandler from '../../event-handler/modals';
import KeyDownHandler from '../../event-handler/keyDown';
import SuggestionHandler from '../../event-handler/suggestions';
import blockStyleFn from '../../Utils/BlockStyle';
import { mergeRecursive } from '../../utils/toolbar';
import InlineControl from '../InlineControl';
import BlockControl from '../BlockControl';
import FontSizeControl from '../FontSizeControl';
import FontFamilyControl from '../FontFamilyControl';
import ListControl from '../ListControl';
import TextAlignControl from '../TextAlignControl';
import ColorPicker from '../ColorPicker';
import RemoveControl from '../RemoveControl';
import LinkControl from '../LinkControl';
import EmbeddedControl from '../EmbeddedControl';
import EmojiControl from '../EmojiControl';
import ImageControl from '../ImageControl';
import HistoryControl from '../HistoryControl';
import MentionDecorator from '../../decorators/Mention';
import BlockRendererFunc from '../../renderer';
import defaultToolbar from '../../config/defaultToolbar';
import './styles.css';
import '../../../../css/Draft.css';

export default class WysiwygEditor extends Component {

  static propTypes = {
    onChange: PropTypes.func,
    // initialContentState is deprecated and will be removed in 2.0
    initialContentState: PropTypes.object,
    contentState: PropTypes.object,
    toolbarOnFocus: PropTypes.bool,
    spellCheck: PropTypes.bool,
    toolbar: PropTypes.object,
    toolbarClassName: PropTypes.string,
    editorClassName: PropTypes.string,
    wrapperClassName: PropTypes.string,
    uploadCallback: PropTypes.func,
    mention: PropTypes.object,
    textAlignment: PropTypes.string,
    readOnly: PropTypes.bool,
    tabIndex: PropTypes.number,
    placeholder: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {
      editorState: undefined,
      editorFocused: false,
      toolbar: mergeRecursive(defaultToolbar, props.toolbar),
    };
  }

  componentWillMount(): void {
    let editorState;
    const decorators = [];
    this.modalHandler = new ModalHandler();
    if (this.props.mention) {
      MentionDecorator.setConfig({
        ...this.props.mention,
        onChange: this.onChange,
        getEditorState: this.getEditorState,
        getWrapperRef: this.getWrapperRef,
        modalHandler: this.modalHandler,
      });
      decorators.push(...MentionDecorator.decorators);
    }
    const compositeDecorator = new CompositeDecorator(decorators);
    const propContentState = this.props.initialContentState || this.props.contentState;
    if (propContentState) {
      const contentState = convertFromRaw(propContentState);
      editorState = EditorState.createWithContent(contentState, compositeDecorator);
    } else {
      editorState = EditorState.createEmpty(compositeDecorator);
    }
    this.setState({
      editorState,
    });
  }

  componentDidMount(): void {
    this.modalHandler.init();
  }
  // todo: change decorators depending on properties recceived in componentWillReceiveProps.

  componentWillReceiveProps(props) {
    const newState = {};
    if (this.props.toolbar !== props.toolbar) {
      newState.toolbar = mergeRecursive(defaultToolbar, props.toolbar);
    }
    if (this.props.mention !== props.mention) {
      MentionDecorator.setConfig(this.props.mention);
    }
    if (props.contentState && this.props.contentState !== props.contentState) {
      const newEditorState = this.changeEditorState(props.contentState);
      if (newEditorState) {
        newState.editorState = newEditorState;
      }
    }
    this.setState(newState);
  }

  onEditorBlur: Function = (): void => {
    this.setState({
      editorFocused: false,
    });
  };

  onEditorFocus: Function = (): void => {
    this.setState({
      editorFocused: true,
    });
  };

  onTab: Function = (event): boolean => {
    const editorState = changeDepth(this.state.editorState, event.shiftKey ? -1 : 1, 4);
    if (editorState) {
      this.onChange(editorState);
      event.preventDefault();
    }
  };

  onUpDownArrow: Function = (event): boolean => {
    if (SuggestionHandler.isOpen()) {
      event.preventDefault();
    }
  };

  onChange: Function = (editorState: Object): void => {
    const { readOnly } = this.props;
    if (!readOnly) {
      this.setState({
        editorState,
      },
      this.afterChange());
    }
  };

  setWrapperReference: Function = (ref: Object): void => {
    this.wrapper = ref;
  };

  setEditorReference: Function = (ref: Object): void => {
    this.editor = ref;
  };

  getWrapperRef = () => this.wrapper;

  getEditorState = () => this.state.editorState;

  changeEditorState = (contentState) => {
    const newContentState = convertFromRaw(contentState);
    const { editorState } = this.state;
    return EditorState.push(editorState, newContentState, 'change-block-data');
  };

  focusEditor: Function = (): void => {
    setTimeout(() => {
      this.editor.focus();
    });
  };

  afterChange: Function = (): void => {
    setTimeout(() => {
      if (this.props.onChange) {
        let editorContent = convertToRaw(this.state.editorState.getCurrentContent());
        editorContent = this.enrichData(editorContent);

        console.log('onChange:', this.props.onChange, editorContent);

        this.props.onChange(editorContent);
      }
    });
  };

  enrichData: Function = (editorContent: RawDraftContentState): RawDraftContentState => {
    const newEditorContent = editorContent;
    if (this.props.textAlignment) {
      editorContent.blocks.forEach((block) => {
        if (!block.data['text-align']) {
          block.data['text-align'] = this.props.textAlignment; // eslint-disable-line no-param-reassign
        }
      });
    }
    return newEditorContent;
  };

  customBlockRenderMap: Map = DefaultDraftBlockRenderMap
  .merge(new Map({
    unstyled: {
      element: 'p',
    },
  }));

  handleKeyCommand: Function = (command: Object): boolean => {
    const { editorState } = this.state;
    const newState = RichUtils.handleKeyCommand(editorState, command);
    if (newState) {
      this.onChange(newState);
      return true;
    }
    return false;
  };

  handleReturn: Function = (event: Object): boolean => {
    let returnValue = false;
    if (this.props.mention) {
      returnValue = MentionDecorator.handleReturn();
    }
    const editorState = handleNewLine(this.state.editorState, event);
    if (editorState) {
      this.onChange(editorState);
      returnValue = true;
    }
    return returnValue;
  };

  preventDefault: Function = (event: Object) => {
    if (event.target.tagName !== 'INPUT') {
      event.preventDefault();
    }
  };

  render() {
    const {
      editorState,
      editorFocused,
      toolbar,
     } = this.state;
    const {
      toolbarOnFocus,
      toolbarClassName,
      editorClassName,
      wrapperClassName,
      uploadCallback,
      textAlignment,
      spellCheck,
      readOnly,
      tabIndex,
      placeholder,
    } = this.props;
    const {
      options,
      inline,
      blockType,
      fontSize,
      fontFamily,
      list,
      textAlign,
      colorPicker,
      link,
      embedded,
      emoji,
      image,
      remove,
      history,
    } = toolbar;

    return (
      <div
        className={wrapperClassName}
        onClick={this.modalHandler.onEditorClick}
      >
        {
          (editorFocused || !toolbarOnFocus) ?
            <div
              className={classNames('rdw-editor-toolbar', toolbarClassName)}
              onMouseDown={this.preventDefault}
            >
              {options.indexOf('inline') >= 0 && <InlineControl
                modalHandler={this.modalHandler}
                onChange={this.onChange}
                editorState={editorState}
                config={inline}
              />}
              {options.indexOf('blockType') >= 0 && <BlockControl
                modalHandler={this.modalHandler}
                onChange={this.onChange}
                editorState={editorState}
                config={blockType}
              />}
              {options.indexOf('fontSize') >= 0 && <FontSizeControl
                modalHandler={this.modalHandler}
                onChange={this.onChange}
                editorState={editorState}
                config={fontSize}
              />}
              {options.indexOf('fontFamily') >= 0 && <FontFamilyControl
                modalHandler={this.modalHandler}
                onChange={this.onChange}
                editorState={editorState}
                config={fontFamily}
              />}
              {options.indexOf('list') >= 0 && <ListControl
                modalHandler={this.modalHandler}
                onChange={this.onChange}
                editorState={editorState}
                config={list}
              />}
              {options.indexOf('textAlign') >= 0 && <TextAlignControl
                modalHandler={this.modalHandler}
                onChange={this.onChange}
                editorState={editorState}
                config={textAlign}
              />}
              {options.indexOf('colorPicker') >= 0 && <ColorPicker
                modalHandler={this.modalHandler}
                onChange={this.onChange}
                editorState={editorState}
                config={colorPicker}
              />}
              {options.indexOf('link') >= 0 && <LinkControl
                modalHandler={this.modalHandler}
                editorState={editorState}
                onChange={this.onChange}
                config={link}
              />}
              {options.indexOf('embedded') >= 0 && <EmbeddedControl
                modalHandler={this.modalHandler}
                editorState={editorState}
                onChange={this.onChange}
                config={embedded}
              />}
              {options.indexOf('emoji') >= 0 && <EmojiControl
                modalHandler={this.modalHandler}
                editorState={editorState}
                onChange={this.onChange}
                config={emoji}
              />}
              {options.indexOf('image') >= 0 && <ImageControl
                modalHandler={this.modalHandler}
                editorState={editorState}
                onChange={this.onChange}
                uploadCallback={uploadCallback}
                config={image}
              />}
              {options.indexOf('remove') >= 0 && <RemoveControl
                editorState={editorState}
                onChange={this.onChange}
                config={remove}
              />}
              {options.indexOf('history') >= 0 && <HistoryControl
                modalHandler={this.modalHandler}
                editorState={editorState}
                onChange={this.onChange}
                config={history}
              />}
            </div>
          :
          undefined
        }
        <div
          ref={this.setWrapperReference}
          className={classNames('rdw-editor-main', editorClassName)}
          onClick={this.focusEditor}
          onFocus={this.onEditorFocus}
          onBlur={this.onEditorBlur}
          onKeyDown={KeyDownHandler.onKeyDown}
        >
          <Editor
            ref={this.setEditorReference}
            onTab={this.onTab}
            onUpArrow={this.onUpDownArrow}
            onDownArrow={this.onUpDownArrow}
            tabIndex={tabIndex}
            readOnly={readOnly}
            spellCheck={spellCheck}
            editorState={editorState}
            onChange={this.onChange}
            textAlignment={textAlignment}
            blockStyleFn={blockStyleFn}
            customStyleMap={customStyleMap}
            handleReturn={this.handleReturn}
            blockRendererFn={BlockRendererFunc}
            blockRenderMap={this.customBlockRenderMap}
            handleKeyCommand={this.handleKeyCommand}
            placeholder={placeholder}
          />
        </div>
      </div>
    );
  }
}

// todo: evaluate draftjs-utils to move some methods here
