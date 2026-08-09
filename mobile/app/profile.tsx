import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  navy: '#1B2A5B',
  crimson: '#C41E3A',
  ivory: '#FAF7F2',
  cream: '#F0EBE3',
  warmGray: '#8B7569',
  white: '#FFFFFF',
};

interface Measurement {
  label: string;
  value: string;
  unit: string;
}

interface SettingsItem {
  icon: string;
  label: string;
  detail?: string;
  hasArrow: boolean;
}

const MEASUREMENTS: Measurement[] = [
  { label: 'Bust', value: '36', unit: 'in' },
  { label: 'Waist', value: '28', unit: 'in' },
  { label: 'Hip', value: '38', unit: 'in' },
  { label: 'Shoulder', value: '15', unit: 'in' },
  { label: 'Arm Length', value: '24', unit: 'in' },
  { label: 'Inseam', value: '30', unit: 'in' },
];

const FIT_PREFERENCES = [
  { label: 'Fit Style', value: 'Tailored' },
  { label: 'Preferred Length', value: 'Midi / Floor' },
  { label: 'Neckline', value: 'V-neck, Boat neck' },
  { label: 'Sleeve', value: 'Three-quarter, Cap' },
  { label: 'Fabrics', value: 'Silk, Chiffon, Linen' },
];

const SETTINGS: SettingsItem[] = [
  { icon: '♦', label: 'Notifications', detail: 'On', hasArrow: true },
  { icon: '◆', label: 'Payment Methods', detail: 'Visa ...4821', hasArrow: true },
  { icon: '◇', label: 'Shipping Addresses', detail: '2 saved', hasArrow: true },
  { icon: '▤', label: 'Order History', hasArrow: true },
  { icon: '◎', label: 'Help & Support', hasArrow: true },
  { icon: '●', label: 'Privacy & Terms', hasArrow: true },
];

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>AO</Text>
            </View>
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarBadgeText}>VIP</Text>
            </View>
          </View>
          <Text style={styles.userName}>Ama Okyere</Text>
          <Text style={styles.userEmail}>ama.okyere@email.com</Text>
          <View style={styles.userStats}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>12</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>8</Text>
              <Text style={styles.statLabel}>Consults</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>3</Text>
              <Text style={styles.statLabel}>Custom</Text>
            </View>
          </View>
        </View>

        {/* Measurements */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionLabel}>BODY PROFILE</Text>
              <Text style={styles.sectionTitle}>My Measurements</Text>
            </View>
            <TouchableOpacity style={styles.updateButton}>
              <Text style={styles.updateButtonText}>UPDATE</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.measurementGrid}>
            {MEASUREMENTS.map((m) => (
              <View key={m.label} style={styles.measurementItem}>
                <Text style={styles.measurementValue}>
                  {m.value}
                  <Text style={styles.measurementUnit}> {m.unit}</Text>
                </Text>
                <Text style={styles.measurementLabel}>{m.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.lastUpdated}>
            <Text style={styles.lastUpdatedText}>Last updated: March 28, 2026</Text>
          </View>
        </View>

        {/* Fit Preferences */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionLabel}>STYLE PROFILE</Text>
              <Text style={styles.sectionTitle}>Fit Preferences</Text>
            </View>
            <TouchableOpacity style={styles.updateButton}>
              <Text style={styles.updateButtonText}>EDIT</Text>
            </TouchableOpacity>
          </View>

          {FIT_PREFERENCES.map((pref, index) => (
            <View
              key={pref.label}
              style={[
                styles.prefRow,
                index < FIT_PREFERENCES.length - 1 && styles.prefRowBorder,
              ]}
            >
              <Text style={styles.prefLabel}>{pref.label}</Text>
              <Text style={styles.prefValue}>{pref.value}</Text>
            </View>
          ))}
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionLabel}>ACCOUNT</Text>
              <Text style={styles.sectionTitle}>Settings</Text>
            </View>
          </View>

          {SETTINGS.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.settingsRow,
                index < SETTINGS.length - 1 && styles.settingsRowBorder,
              ]}
            >
              <View style={styles.settingsLeft}>
                <Text style={styles.settingsIcon}>{item.icon}</Text>
                <Text style={styles.settingsLabel}>{item.label}</Text>
              </View>
              <View style={styles.settingsRight}>
                {item.detail && (
                  <Text style={styles.settingsDetail}>{item.detail}</Text>
                )}
                {item.hasArrow && <Text style={styles.settingsArrow}>→</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>AWULA_K v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.ivory,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cream,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  editLink: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.crimson,
  },
  // User Card
  userCard: {
    backgroundColor: COLORS.navy,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 14,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.crimson,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 1,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    backgroundColor: COLORS.crimson,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.navy,
  },
  avatarBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  userName: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
  },
  userStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 23,
    fontWeight: '700',
    color: COLORS.white,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  // Sections
  section: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.cream,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.crimson,
    letterSpacing: 2,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.navy,
  },
  updateButton: {
    borderWidth: 1,
    borderColor: COLORS.navy,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
  },
  updateButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 1,
  },
  // Measurements
  measurementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  measurementItem: {
    width: '30%',
    backgroundColor: COLORS.ivory,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  measurementValue: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.navy,
  },
  measurementUnit: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.warmGray,
  },
  measurementLabel: {
    fontSize: 13,
    color: COLORS.warmGray,
    marginTop: 4,
    fontWeight: '500',
  },
  lastUpdated: {
    marginTop: 12,
    alignItems: 'center',
  },
  lastUpdatedText: {
    fontSize: 13,
    color: COLORS.warmGray,
    fontStyle: 'italic',
  },
  // Preferences
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  prefRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cream,
  },
  prefLabel: {
    fontSize: 16,
    color: COLORS.warmGray,
    fontWeight: '500',
  },
  prefValue: {
    fontSize: 16,
    color: COLORS.navy,
    fontWeight: '600',
    textAlign: 'right',
    maxWidth: '55%',
  },
  // Settings
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cream,
  },
  settingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsIcon: {
    fontSize: 20,
    color: COLORS.navy,
    width: 24,
    textAlign: 'center',
  },
  settingsLabel: {
    fontSize: 17,
    color: COLORS.navy,
    fontWeight: '500',
  },
  settingsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsDetail: {
    fontSize: 15,
    color: COLORS.warmGray,
  },
  settingsArrow: {
    fontSize: 18,
    color: COLORS.warmGray,
  },
  // Sign Out
  signOutButton: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.crimson,
  },
  signOutText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.crimson,
    letterSpacing: 0.5,
  },
  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 13,
    color: COLORS.warmGray,
  },
});
