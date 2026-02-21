import { FlexPlugin } from '@twilio/flex-plugin';
import SegmentLookup from './components/SegmentLookup';

const PLUGIN_NAME = 'GetSegmentByTaskPlugin';

export default class GetSegmentByTaskPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  async init(flex, manager) {
    flex.AgentDesktopView.Panel2.Content.add(
      <SegmentLookup manager={manager} key="segment-lookup" />,
      { if: (props) => !props.task, sortOrder: -1 }
    );
  }
}
