const React = require('react');

function chain() {
  const api = {
    duration: () => api,
    delay: () => api,
    reduceMotion: () => api,
    springify: () => api,
    damping: () => api,
    stiffness: () => api,
    withInitialValues: () => api,
    build: () => api,
  };
  return api;
}

function createAnimatedComponent(Component) {
  return Component;
}

const Animated = {
  View: 'Animated.View',
  Text: 'Animated.Text',
  Image: 'Animated.Image',
  ScrollView: 'Animated.ScrollView',
  FlatList: 'Animated.FlatList',
  createAnimatedComponent,
};

// Host-string Animated.View breaks style tests. Use RN View.
const { View, Text, Image, ScrollView, FlatList } = require('react-native');
Animated.View = View;
Animated.Text = Text;
Animated.Image = Image;
Animated.ScrollView = ScrollView;
Animated.FlatList = FlatList;

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  createAnimatedComponent,
  FadeIn: chain(),
  FadeOut: chain(),
  FadeInDown: chain(),
  FadeInUp: chain(),
  SlideInRight: chain(),
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
  useSharedValue: (init) => ({ value: init }),
  useAnimatedStyle: (fn) => {
    try {
      return fn();
    } catch {
      return {};
    }
  },
  useAnimatedRef: () => ({ current: null }),
  useDerivedValue: (fn) => ({ value: fn() }),
  withSpring: (to) => to,
  withTiming: (to) => to,
  withRepeat: (value) => value,
  withDelay: (_ms, value) => value,
  Easing: { linear: (t) => t, ease: (t) => t, inOut: (t) => t },
  interpolate: (v) => v,
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  setUpTests: () => undefined,
};
