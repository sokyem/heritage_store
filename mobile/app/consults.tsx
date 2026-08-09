import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  FlatList,
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

type ConsultStatus = 'Scheduled' | 'Completed' | 'Cancelled';
type ConsultType = 'Virtual Styling' | 'In-Person Fitting' | 'Custom Design Brief' | 'Bridal Consultation' | 'Fabric Selection';

interface Consultation {
  id: string;
  date: string;
  time: string;
  status: ConsultStatus;
  type: ConsultType;
  stylist: string;
  notes: string;
  duration: string;
}

const STATUS_CONFIG: Record<ConsultStatus, { bg: string; text: string; dot: string }> = {
  Scheduled: { bg: '#E8F5E9', text: '#2E7D32', dot: '#4CAF50' },
  Completed: { bg: '#E8EAF6', text: '#283593', dot: '#5C6BC0' },
  Cancelled: { bg: '#FFEBEE', text: '#C62828', dot: '#EF5350' },
};

const MOCK_CONSULTS: Consultation[] = [
  {
    id: '1',
    date: 'April 12, 2026',
    time: '2:00 PM',
    status: 'Scheduled',
    type: 'In-Person Fitting',
    stylist: 'Amara Osei',
    notes: 'Second fitting for the Olive Celebration Ensemble. Bring preferred shoes.',
    duration: '45 min',
  },
  {
    id: '2',
    date: 'April 18, 2026',
    time: '10:30 AM',
    status: 'Scheduled',
    type: 'Virtual Styling',
    stylist: 'Amara Osei',
    notes: 'Spring wardrobe review and accessory pairing session.',
    duration: '30 min',
  },
  {
    id: '3',
    date: 'April 25, 2026',
    time: '3:00 PM',
    status: 'Scheduled',
    type: 'Fabric Selection',
    stylist: 'Kwame Asante',
    notes: 'Review imported silk and linen swatches for summer collection custom orders.',
    duration: '60 min',
  },
  {
    id: '4',
    date: 'March 28, 2026',
    time: '11:00 AM',
    status: 'Completed',
    type: 'Custom Design Brief',
    stylist: 'Amara Osei',
    notes: 'Initial design consultation for the Midnight Blue Evening Gown. Measurements taken.',
    duration: '60 min',
  },
  {
    id: '5',
    date: 'March 15, 2026',
    time: '4:00 PM',
    status: 'Completed',
    type: 'Bridal Consultation',
    stylist: 'Esi Mensah',
    notes: 'Discussed bridal vision, fabric preferences, and timeline for the Ivory Two-Piece.',
    duration: '90 min',
  },
  {
    id: '6',
    date: 'March 5, 2026',
    time: '1:00 PM',
    status: 'Cancelled',
    type: 'Virtual Styling',
    stylist: 'Amara Osei',
    notes: 'Rescheduled due to client conflict.',
    duration: '30 min',
  },
];

const CONSULT_TYPES: { type: ConsultType; icon: string; desc: string }[] = [
  { type: 'Virtual Styling', icon: '◇', desc: 'Video call with your stylist' },
  { type: 'In-Person Fitting', icon: '◆', desc: 'At our atelier studio' },
  { type: 'Custom Design Brief', icon: '✦', desc: 'Create your vision' },
  { type: 'Bridal Consultation', icon: '♦', desc: 'Your special day' },
];

type TabType = 'upcoming' | 'past';

export default function ConsultsScreen() {
  const [tab, setTab] = useState<TabType>('upcoming');

  const upcoming = MOCK_CONSULTS.filter((c) => c.status === 'Scheduled');
  const past = MOCK_CONSULTS.filter((c) => c.status !== 'Scheduled');
  const displayList = tab === 'upcoming' ? upcoming : past;

  const renderConsultation = ({ item }: { item: Consultation }) => {
    const config = STATUS_CONFIG[item.status];
    return (
      <TouchableOpacity style={styles.consultCard}>
        {/* Date Strip */}
        <View style={styles.dateStrip}>
          <Text style={styles.dateStripDay}>
            {item.date.split(' ')[1]?.replace(',', '')}
          </Text>
          <Text style={styles.dateStripMonth}>
            {item.date.split(' ')[0]?.substring(0, 3).toUpperCase()}
          </Text>
        </View>

        {/* Card Content */}
        <View style={styles.consultContent}>
          <View style={styles.consultHeader}>
            <View style={styles.consultTypeRow}>
              <Text style={styles.consultType}>{item.type}</Text>
              <View style={[styles.statusDot, { backgroundColor: config.dot }]} />
            </View>
            <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
              <Text style={[styles.statusText, { color: config.text }]}>{item.status}</Text>
            </View>
          </View>

          <View style={styles.consultMeta}>
            <Text style={styles.consultTime}>{item.time}</Text>
            <Text style={styles.consultDivider}>|</Text>
            <Text style={styles.consultDuration}>{item.duration}</Text>
            <Text style={styles.consultDivider}>|</Text>
            <Text style={styles.consultStylist}>{item.stylist}</Text>
          </View>

          <Text style={styles.consultNotes}>{item.notes}</Text>

          {item.status === 'Scheduled' && (
            <View style={styles.consultActions}>
              <TouchableOpacity style={styles.actionPrimary}>
                <Text style={styles.actionPrimaryText}>JOIN / DETAILS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionSecondary}>
                <Text style={styles.actionSecondaryText}>RESCHEDULE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Consultations</Text>
          <Text style={styles.subtitle}>
            {upcoming.length} upcoming {upcoming.length === 1 ? 'session' : 'sessions'}
          </Text>
        </View>
      </View>

      {/* Book CTA */}
      <TouchableOpacity style={styles.bookCta}>
        <View style={styles.bookCtaContent}>
          <Text style={styles.bookCtaIcon}>◎</Text>
          <View style={styles.bookCtaTextGroup}>
            <Text style={styles.bookCtaTitle}>Book a Consultation</Text>
            <Text style={styles.bookCtaSubtitle}>
              Personal styling, fittings, or design briefs with our experts
            </Text>
          </View>
        </View>
        <Text style={styles.bookCtaArrow}>→</Text>
      </TouchableOpacity>

      {/* Consultation Types */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.typesRow}
      >
        {CONSULT_TYPES.map((ct) => (
          <TouchableOpacity key={ct.type} style={styles.typeChip}>
            <Text style={styles.typeChipIcon}>{ct.icon}</Text>
            <Text style={styles.typeChipText}>{ct.type}</Text>
            <Text style={styles.typeChipDesc}>{ct.desc}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'upcoming' && styles.tabActive]}
          onPress={() => setTab('upcoming')}
        >
          <Text style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}>
            Upcoming ({upcoming.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'past' && styles.tabActive]}
          onPress={() => setTab('past')}
        >
          <Text style={[styles.tabText, tab === 'past' && styles.tabTextActive]}>
            Past ({past.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={displayList}
        renderItem={renderConsultation}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>◎</Text>
            <Text style={styles.emptyTitle}>
              {tab === 'upcoming' ? 'No upcoming consultations' : 'No past consultations'}
            </Text>
            <Text style={styles.emptySubtitle}>
              Book a session with our stylists to get started.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.ivory,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cream,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.warmGray,
    marginTop: 2,
  },
  // Book CTA
  bookCta: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: COLORS.navy,
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  bookCtaIcon: {
    fontSize: 32,
    color: COLORS.crimson,
  },
  bookCtaTextGroup: {
    flex: 1,
  },
  bookCtaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  bookCtaSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 19,
  },
  bookCtaArrow: {
    fontSize: 23,
    color: COLORS.white,
    marginLeft: 8,
  },
  // Types
  typesRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  typeChip: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.cream,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    width: 130,
  },
  typeChipIcon: {
    fontSize: 23,
    color: COLORS.navy,
    marginBottom: 6,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
    textAlign: 'center',
    marginBottom: 2,
  },
  typeChipDesc: {
    fontSize: 12,
    color: COLORS.warmGray,
    textAlign: 'center',
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.crimson,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.warmGray,
  },
  tabTextActive: {
    color: COLORS.navy,
  },
  // List
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  consultCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.cream,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  dateStrip: {
    width: 56,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  dateStripDay: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.white,
  },
  dateStripMonth: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    marginTop: 2,
  },
  consultContent: {
    flex: 1,
    padding: 14,
  },
  consultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  consultTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consultType: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  consultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  consultTime: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.warmGray,
  },
  consultDivider: {
    fontSize: 14,
    color: COLORS.cream,
  },
  consultDuration: {
    fontSize: 14,
    color: COLORS.warmGray,
  },
  consultStylist: {
    fontSize: 14,
    color: COLORS.warmGray,
  },
  consultNotes: {
    fontSize: 14,
    color: COLORS.warmGray,
    lineHeight: 20,
  },
  consultActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionPrimary: {
    backgroundColor: COLORS.crimson,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
  },
  actionPrimaryText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  actionSecondary: {
    borderWidth: 1,
    borderColor: COLORS.navy,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
  },
  actionSecondaryText: {
    color: COLORS.navy,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 54,
    color: COLORS.cream,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: COLORS.warmGray,
    textAlign: 'center',
    lineHeight: 24,
  },
});
