const mock = require('react-native-worklets/src/mock');

module.exports = {
  ...mock,
  toggleSlowAnimationsOnUIRuntime: () => undefined,
  getUIRuntimeHolder: () => ({}),
  getUISchedulerHolder: () => ({}),
};
