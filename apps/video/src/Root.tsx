import './index.css'
import { Composition } from 'remotion'
import { DEFAULT_PROPS, VideoPropsSchema } from './shared/schema'
import {
  TopicExplainer,
  calculateTopicExplainerMetadata,
} from './compositions/TopicExplainer'
import {
  TwitterThread,
  calculateTwitterThreadMetadata,
} from './compositions/TwitterThread'
import {
  QuickTip,
  calculateQuickTipMetadata,
} from './compositions/QuickTip'

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TopicExplainer"
        component={TopicExplainer}
        schema={VideoPropsSchema}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={calculateTopicExplainerMetadata}
        durationInFrames={30 * 60}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="TwitterThread"
        component={TwitterThread}
        schema={VideoPropsSchema}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={calculateTwitterThreadMetadata}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="QuickTip"
        component={QuickTip}
        schema={VideoPropsSchema}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={calculateQuickTipMetadata}
        durationInFrames={30 * 20}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  )
}
