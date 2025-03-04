'use strict';

import memoize from 'memoize-one';
import React from 'react';
import ReactNative, {
  NativeModules,
  PanResponder,
  PixelRatio,
  Platform,
  processColor,
  requireNativeComponent,
  UIManager,
} from 'react-native';
import {requestPermissions} from './handlePermissions';
import type {CanvasText, Path, PathData, SketchCanvasProps} from './types';

const SketchViewName = 'RNSketchCanvas';
const RNSketchCanvas = requireNativeComponent(
  SketchViewName,
) as unknown as string;
const SketchCanvasManager = NativeModules.RNSketchCanvasManager || {};

type CanvasState = {
  text: any;
};

class SketchCanvas extends React.Component<SketchCanvasProps, CanvasState> {
  static defaultProps = {
    style: null,
    strokeColor: '#000000',
    strokeWidth: 3,
    onPathsChange: () => {},
    onStrokeStart: (_x: number, _y: number) => {},
    onStrokeChanged: () => {},
    onStrokeChangedData: () => {},
    onStrokeEnd: () => {},
    onSketchSaved: () => {},
    onPathIdAssigned: () => {},
    user: null,

    touchEnabled: true,

    text: null,
    localSourceImage: null,

    permissionDialogTitle: '',
    permissionDialogMessage: '',
  };

  _pathsToProcess: Path[];
  _paths: Path[];
  _path: PathData | null;
  _handle: any;
  _screenScale: number;
  _offset: {x: number; y: number};
  _size: {width: number; height: number};
  _initialized: boolean;
  panResponder: any;
  _pathIds: any[];
  _gestureState: any;

  state = {
    text: null,
  };
  static MAIN_BUNDLE: any;
  static DOCUMENT: any;
  static LIBRARY: any;
  static CACHES: any;

  constructor(props: SketchCanvasProps) {
    super(props);
    this._pathsToProcess = [];
    this._paths = [];
    this._path = null;
    this._handle = null;
    this._screenScale = Platform.OS === 'ios' ? 1 : PixelRatio.get();
    this._offset = {x: 0, y: 0};
    this._size = {width: 0, height: 0};
    this._initialized = false;

    this._pathIds = [];
    this._gestureState = null;

    this.panResponder = PanResponder.create({
      // Ask to be the responder:
      onStartShouldSetPanResponder: (_evt: any, _gestureState: any) => true,
      onStartShouldSetPanResponderCapture: (_evt: any, _gestureState: any) =>
        true,
      onMoveShouldSetPanResponder: (_evt: any, _gestureState: any) => true,
      onMoveShouldSetPanResponderCapture: (_evt: any, _gestureState: any) =>
        true,

      onPanResponderGrant: (
        evt: {nativeEvent: any},
        gestureState: {x0: number; y0: number},
      ) => {
        if (!props.touchEnabled) {
          return;
        }
        this._gestureState = 'grant';
        const e = evt.nativeEvent;
        this._offset = {x: e.pageX - e.locationX, y: e.pageY - e.locationY};
        this._path = {
          id:
            this._pathIds.length > 0
              ? parseInt(this._pathIds[0], 10)
              : parseInt(String(Math.random() * 100000000), 10),
          color: props.strokeColor,
          width: props.strokeWidth,
          data: [],
        };

        this._pathIds.splice(0, 1);
        if (this.props.onPathIdAssigned) this.props.onPathIdAssigned(true);

        UIManager.dispatchViewManagerCommand(
          this._handle,
          UIManager.getViewManagerConfig(RNSketchCanvas).Commands.newPath!,
          [
            this._path.id,
            processColor(this._path.color),
            this._path.width ? this._path.width * this._screenScale : 0,
          ],
        );

        UIManager.dispatchViewManagerCommand(
          this._handle,
          UIManager.getViewManagerConfig(RNSketchCanvas).Commands.addPoint!,
          [
            parseFloat(
              (
                Number((gestureState.x0 - this._offset.x).toFixed(2)) *
                this._screenScale
              ).toString(),
            ),
            parseFloat(
              (
                Number((gestureState.y0 - this._offset.y).toFixed(2)) *
                this._screenScale
              ).toString(),
            ),
          ],
        );
        const x = parseFloat((gestureState.x0 - this._offset.x).toFixed(2)),
          y = parseFloat((gestureState.y0 - this._offset.y).toFixed(2));
        this._path.data.push(`${x},${y}`);
        props.onStrokeStart?.(x, y);
      },
      onPanResponderMove: (
        _evt: any,
        gestureState: {moveX: number; moveY: number},
      ) => {
        if (!props.touchEnabled) {
          return;
        }
        this._gestureState = 'move';
        if (this._path) {
          UIManager.dispatchViewManagerCommand(
            this._handle,
            UIManager.getViewManagerConfig(RNSketchCanvas).Commands.addPoint!,
            [
              parseFloat(
                (
                  Number((gestureState.moveX - this._offset.x).toFixed(2)) *
                  this._screenScale
                ).toString(),
              ),
              parseFloat(
                (
                  Number((gestureState.moveY - this._offset.y).toFixed(2)) *
                  this._screenScale
                ).toString(),
              ),
            ],
          );
          const x = parseFloat(
              (gestureState.moveX - this._offset.x).toFixed(2),
            ),
            y = parseFloat((gestureState.moveY - this._offset.y).toFixed(2));
          this._path.data.push(`${x},${y}`);
          props.onStrokeChanged?.(x, y);
          this.getRealTimePathData();
        }
      },
      onPanResponderRelease: (_evt: any, _gestureState: any) => {
        if (!props.touchEnabled) {
          return;
        }
        if (this._path) {
          if (this.props.onStrokeEnd)
            this.props.onStrokeEnd(
              {
                path: this._path,
                size: this._size,
                drawer: this.props.user,
              },
              _gestureState,
            );
          this._paths.push({
            path: this._path,
            size: this._size,
            drawer: props.user,
          });
        }
        UIManager.dispatchViewManagerCommand(
          this._handle,
          UIManager.getViewManagerConfig(RNSketchCanvas).Commands.endPath!,
          [],
        );
      },

      onShouldBlockNativeResponder: (_evt: any, _gestureState: any) => {
        return true;
      },
    });
  }

  _processText(text: any) {
    text &&
      text.forEach(
        (t: {fontColor: any}) => (t.fontColor = processColor(t.fontColor)),
      );
    return text;
  }

  getProcessedText = memoize((text: CanvasText[] | undefined) => {
    const textCopy = text ? text.map(t => Object.assign({}, t)) : null;

    return this._processText(textCopy);
  });

  clear() {
    this._paths = [];
    this._path = null;
    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.getViewManagerConfig(RNSketchCanvas).Commands.clear!,
      [],
    );
  }

  undo() {
    let lastId = -1;
    this._paths.forEach(
      (d: any) => (lastId = d.drawer === this.props?.user ? d.path.id : lastId),
    );
    if (lastId >= 0) {
      this.deletePath(lastId);
    }
    return lastId;
  }

  setPathId(pathId: any) {
    this._pathIds.push(pathId);
  }

  addPath(data: Path) {
    if (this._initialized) {
      if (
        this._paths.filter((p: Path) => p.path.id === data.path.id).length === 0
      ) {
        this._paths.push(data);
      }
      const pathData = data.path.data.map((p: any) => {
        const coor = p.split(',').map((pp: any) => parseFloat(pp).toFixed(2));
        return `${
          (coor[0] * this._screenScale * this._size.width) / data.size.width
        },${
          (coor[1] * this._screenScale * this._size.height) / data.size.height
        }`;
      });
      UIManager.dispatchViewManagerCommand(
        this._handle,
        UIManager.getViewManagerConfig(RNSketchCanvas).Commands.addPath!,
        [
          data.path.id,
          processColor(data.path.color),
          data.path.width ? data.path.width * this._screenScale : 0,
          pathData,
        ],
      );
    } else {
      this._pathsToProcess.filter((p: Path) => p.path.id === data.path.id)
        .length === 0 && this._pathsToProcess.push(data);
    }
  }

  deletePath(id: any) {
    this._paths = this._paths.filter(p => p.path.id !== id);
    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.getViewManagerConfig(RNSketchCanvas).Commands.deletePath!,
      [id],
    );
  }

  save(
    imageType: string,
    transparent: boolean,
    folder: string,
    filename: string,
    includeImage: boolean,
    includeText: boolean,
    cropToImageSize: boolean,
  ) {
    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.getViewManagerConfig(RNSketchCanvas).Commands.save!,
      [
        imageType,
        folder,
        filename,
        transparent,
        includeImage,
        includeText,
        cropToImageSize,
      ],
    );
  }

  getPaths() {
    return this._paths;
  }

  getBase64(
    imageType: string,
    transparent: boolean,
    includeImage: boolean,
    includeText: boolean,
    cropToImageSize: boolean,
    callback: () => void,
  ) {
    if (Platform.OS === 'ios') {
      SketchCanvasManager.transferToBase64(
        this._handle,
        imageType,
        transparent,
        includeImage,
        includeText,
        cropToImageSize,
        callback,
      );
    } else {
      NativeModules.SketchCanvasModule.transferToBase64(
        this._handle,
        imageType,
        transparent,
        includeImage,
        includeText,
        cropToImageSize,
        callback,
      );
    }
  }

  getRealTimePathData() {
    if (this._path) {
      if (this.props.onStrokeChangedData)
        this.props.onStrokeChangedData(
          {
            path: this._path,
            size: this._size,
            drawer: this.props.user,
          },
          this._gestureState,
        );
    }
  }

  async componentDidMount() {
    await requestPermissions(
      this.props.permissionDialogTitle || '',
      this.props.permissionDialogMessage || '',
    );
  }

  render() {
    return (
      <RNSketchCanvas
        ref={(ref: any) => {
          this._handle = ReactNative.findNodeHandle(ref);
        }}
        style={this.props.style}
        onLayout={(e: any) => {
          this._size = {
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          };
          this._initialized = true;
          this._pathsToProcess.length > 0 &&
            this._pathsToProcess.forEach(p => this.addPath(p));
        }}
        {...this.panResponder.panHandlers}
        onChange={(e: any) => {
          if (e.nativeEvent.hasOwnProperty('pathsUpdate')) {
            this.props.onPathsChange?.(e.nativeEvent.pathsUpdate);
          } else if (
            e.nativeEvent.hasOwnProperty('success') &&
            e.nativeEvent.hasOwnProperty('path')
          ) {
            this.props.onSketchSaved?.(
              e.nativeEvent.success,
              e.nativeEvent.path,
            );
          } else if (e.nativeEvent.hasOwnProperty('success')) {
            this.props.onSketchSaved?.(e.nativeEvent.success, '');
          }
        }}
        localSourceImage={this.props.localSourceImage}
        permissionDialogTitle={this.props.permissionDialogTitle}
        permissionDialogMessage={this.props.permissionDialogMessage}
        text={this.getProcessedText(this.props.text)}
      />
    );
  }
}
const ViewManager = UIManager.getViewManagerConfig(RNSketchCanvas) as any;
SketchCanvas.MAIN_BUNDLE =
  Platform.OS === 'ios' ? ViewManager.Constants.MainBundlePath : '';
SketchCanvas.DOCUMENT =
  Platform.OS === 'ios' ? ViewManager.Constants.NSDocumentDirectory : '';
SketchCanvas.LIBRARY =
  Platform.OS === 'ios' ? ViewManager.Constants.NSLibraryDirectory : '';
SketchCanvas.CACHES =
  Platform.OS === 'ios' ? ViewManager.Constants.NSCachesDirectory : '';

export default SketchCanvas;
