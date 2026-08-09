import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

const COLORS = {
  navy: '#1B2A5B',
  crimson: '#C41E3A',
  ivory: '#FAF7F2',
  cream: '#F0EBE3',
  warmGray: '#8B7569',
};

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, { color: focused ? COLORS.crimson : COLORS.warmGray }]}>
        {icon}
      </Text>
      <Text style={[styles.tabLabel, { color: focused ? COLORS.crimson : COLORS.warmGray }]}>
        {label}
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.crimson,
        tabBarInactiveTintColor: COLORS.warmGray,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="◆" label="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="▤" label="Orders" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="consults"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="◎" label="Consults" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="●" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.cream,
    height: 78,
    paddingTop: 8,
    paddingBottom: 12,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabIcon: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
