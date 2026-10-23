import { useEffect, useState } from 'react';
import { Animated, Platform, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

// The native driver exists on Android/iOS only; on web it logs a warning and falls back anyway.
const useNativeDriver = Platform.OS !== 'web';

/** Gently pulsing placeholder block shown while data loads. */
export function Skeleton({ width = '100%', height, radius = Radius.sm, style }: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: Colors.skeleton, opacity }, style]}
    />
  );
}
