import { Tabs } from 'expo-router';
import { House, List, Settings, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

const INACTIVE_COLOR = Colors.textMuted;
/** Room for the 28 pt icon slot, a 16 pt label and padding; the bottom inset is added on top. */
const TAB_BAR_HEIGHT = 62;

function TabIcon({ icon: Icon, focused }: { icon: LucideIcon; focused: boolean }) {
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Icon size={22} color={focused ? Colors.primary : INACTIVE_COLOR} strokeWidth={focused ? 2.5 : 2} />
    </View>
  );
}

export default function TabLayout() {
  // An explicit height turns off React Navigation's automatic safe-area padding, so the
  // bottom inset (Android gesture/nav bar, iPhone home indicator) is added here.
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarLabelStyle: styles.label,
        tabBarStyle: [styles.tabBar, { height: TAB_BAR_HEIGHT + bottom, paddingBottom: Math.max(bottom, 6) }],
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon icon={House} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="loans"
        options={{
          title: 'Loans',
          tabBarIcon: ({ focused }) => <TabIcon icon={List} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon icon={Settings} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Each tab item already has 5 pt vertical padding; with the 62 pt bar this leaves the
  // 28 pt icon slot plus a full 16 pt label line (measured on web: label no longer clipped).
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
  },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  // Fits the 28 pt icon slot so it never pushes the label down.
  iconPill: { width: 52, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconPillActive: { backgroundColor: Colors.brandSoft },
});
