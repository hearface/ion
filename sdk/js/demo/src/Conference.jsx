import React from "react";
import { Spin } from "antd";
import { LocalVideoView, MainVideoView, SmallVideoView } from "./videoview";


class Conference extends React.Component {
  constructor() {
    super();
    this.state = {
      streams: [],
      localStream: null,
      localScreen: null,
      audioMuted: false,
      videoMuted: false
    };
  }

  componentDidMount = () => {
    const { client } = this.props;
    client.on("stream-add", this._handleAddStream);
    client.on("stream-remove", this._handleRemoveStream);
  };

  componentWillUnmount = () => {
    const { client } = this.props;
    client.off("stream-add", this._handleAddStream);
    client.off("stream-remove", this._handleAddStream);
  };

  _publish = async type => {
    const { client } = this.props;
    let stream = await client.publish({
      codec: "vp8",
      audio: true,
      video: type === "video",
      screen: type === "screen"
    });
    return stream;
  };

  cleanUp = () => {
    let { localStream, localScreen } = this.state;
    if (localStream) this._unpublish(localStream);
    if (localScreen) this._unpublish(localScreen);
    this.setState({ localStream: null, localScreen: null });
  };

  _unpublish = async stream => {
    const { client } = this.props;
    if (stream) {
      this._stopMediaStream(stream.stream);
      await client.unpublish(stream.mid);
    }
  };

  muteMediaTrack = (type, enabled) => {
    let { localStream } = this.state;
    let tracks = localStream.stream.getTracks();
    let track = tracks.find(track => track.kind === type);
    if (track) {
      track.enabled = enabled;
    }
    if (type === "audio") {
      this.setState({ audioMuted: !enabled });
    } else if (type === "video") {
      this.setState({ videoMuted: !enabled });
    }
  };

  handleLocalStream = async enabled => {
    let { localStream } = this.state;
    if (enabled) {
      localStream = await this._publish("video");
    } else {
      if (localStream) {
        this._unpublish(localStream);
        localStream = null;
      }
    }
    this.setState({ localStream });
  };

  handleScreenSharing = async enabled => {
    let { localScreen } = this.state;
    if (enabled) {
      localScreen = await this._publish("screen");
      let track = localScreen.stream.getVideoTracks()[0];
      if (track) {
        track.addEventListener("ended", () => {
          this.handleScreenSharing(false);
        });
      }
    } else {
      if (localScreen) {
        this._unpublish(localScreen);
        localScreen = null;
      }
    }
    this.setState({ localScreen });
  };

  _stopMediaStream = mediaStream => {
    let tracks = mediaStream.getTracks();
    for (let i = 0, len = tracks.length; i < len; i++) {
      tracks[i].stop();
    }
  };

  _handleAddStream = async (rid, mid, info) => {
    const { client } = this.props;
    let streams = this.state.streams;
    let stream = await client.subscribe(rid, mid);
    stream.info = info;
    streams.push({ mid, stream });
    this.setState({ streams });
  };

  _handleRemoveStream = async (rid, mid) => {
    let streams = this.state.streams;
    streams = streams.filter(item => item.mid !== mid);
    this.setState({ streams });
  };

  _onChangeVideoPosition = data => {
    let id = data.id;
    let index = data.index;
    console.log("_onChangeVideoPosition id:" + id + "  index:" + index);

    if (index == 0) {
      return;
    }

    const streams = this.state.streams;
    let first = 0;
    let big = 0;
    for (let i = 0; i < streams.length; i++) {
      let item = streams[i];
      if (item.mid == id) {
        big = i;
        break;
      }
    }

    let c = streams[first];
    streams[first] = streams[big];
    streams[big] = c;

    this.setState({ streams: streams });
  };

  render = () => {
    const { client } = this.props;
    const {
      streams,
      localStream,
      localScreen,
      audioMuted,
      videoMuted
    } = this.state;
    const id = client.uid;
    return (
      <div className="conference-layout">
        {streams.length === 0 && (
          <div className="conference-layout-wating">
            <Spin size="large" tip="Wait for other people joining ..." />
          </div>
        )}
        {streams.map((item, index) => {
          return index == 0 ? (
            <MainVideoView key={item.mid} id={item.mid} stream={item.stream} />
          ) : (
            ""
          );
        })}
        {localStream && (
          <div className="conference-local-video-layout">
            <div className="conference-local-video-size">
              <LocalVideoView
                id={id + "-video"}
                label="Local Stream"
                client={client}
                stream={localStream}
                audioMuted={audioMuted}
                videoMuted={videoMuted}
              />
            </div>
          </div>
        )}
        {localScreen && (
          <div className="conference-local-screen-layout">
            <div className="conference-local-video-size">
              <LocalVideoView
                id={id + "-screen"}
                label="Screen Sharing"
                client={client}
                stream={localScreen}
                audioMuted={false}
                videoMuted={false}
              />
            </div>
          </div>
        )}
        <div className="small-video-list-div">
          <div className="small-video-list">
          {streams.map((item, index) => {
            return index > 0 ? (
              <SmallVideoView
                key={item.mid}
                id={item.mid}
                stream={item.stream}
                videoCount={streams.length}
                collapsed={this.props.collapsed}
                index={index}
                onClick={this._onChangeVideoPosition}
              />
            ) : (
              <div />
            );
          })}
        </div>
        </div>
        
      </div>
    );
  };
}

export default Conference;
