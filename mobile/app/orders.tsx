import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
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

type OrderStatus = 'In Production' | 'Fitting Scheduled' | 'Ready for Pickup' | 'Delivered' | 'Cancelled';

interface Order {
  id: string;
  orderNumber: string;
  productName: string;
  status: OrderStatus;
  date: string;
  estimatedCompletion: string;
  price: string;
  type: 'Custom' | 'Ready-to-Wear';
}

const STATUS_CONFIG: Record<OrderStatus, { bg: string; text: string }> = {
  'In Production': { bg: '#FFF3E0', text: '#E65100' },
  'Fitting Scheduled': { bg: '#E8EAF6', text: '#283593' },
  'Ready for Pickup': { bg: '#E8F5E9', text: '#2E7D32' },
  'Delivered': { bg: '#F3E5F5', text: '#6A1B9A' },
  'Cancelled': { bg: '#FFEBEE', text: '#C62828' },
};

const MOCK_ORDERS: Order[] = [
  {
    id: '1',
    orderNumber: 'AWK-2026-0412',
    productName: 'Midnight Blue Evening Gown',
    status: 'In Production',
    date: 'March 18, 2026',
    estimatedCompletion: 'April 25, 2026',
    price: '$2,850',
    type: 'Custom',
  },
  {
    id: '2',
    orderNumber: 'AWK-2026-0398',
    productName: 'Olive Celebration Ensemble',
    status: 'Fitting Scheduled',
    date: 'March 10, 2026',
    estimatedCompletion: 'April 18, 2026',
    price: '$1,950',
    type: 'Custom',
  },
  {
    id: '3',
    orderNumber: 'AWK-2026-0371',
    productName: 'Silk Charmeuse Blouse',
    status: 'Ready for Pickup',
    date: 'February 28, 2026',
    estimatedCompletion: 'April 5, 2026',
    price: '$485',
    type: 'Ready-to-Wear',
  },
  {
    id: '4',
    orderNumber: 'AWK-2026-0305',
    productName: 'Ivory Bridal Two-Piece',
    status: 'Delivered',
    date: 'January 15, 2026',
    estimatedCompletion: 'March 1, 2026',
    price: '$3,400',
    type: 'Custom',
  },
  {
    id: '5',
    orderNumber: 'AWK-2025-0289',
    productName: 'Crimson Cocktail Dress',
    status: 'Delivered',
    date: 'December 5, 2025',
    estimatedCompletion: 'January 20, 2026',
    price: '$1,200',
    type: 'Custom',
  },
];

type FilterType = 'all' | 'active' | 'completed';

export default function OrdersScreen() {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredOrders = MOCK_ORDERS.filter((order) => {
    if (filter === 'active') return !['Delivered', 'Cancelled'].includes(order.status);
    if (filter === 'completed') return ['Delivered', 'Cancelled'].includes(order.status);
    return true;
  });

  const activeCount = MOCK_ORDERS.filter(
    (o) => !['Delivered', 'Cancelled'].includes(o.status)
  ).length;

  const renderOrder = ({ item }: { item: Order }) => {
    const statusConfig = STATUS_CONFIG[item.status];
    return (
      <TouchableOpacity style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderNumber}>{item.orderNumber}</Text>
            <Text style={styles.orderType}>{item.type}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.statusText, { color: statusConfig.text }]}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.productName}>{item.productName}</Text>

        <View style={styles.orderDetails}>
          <View style={styles.orderDetailItem}>
            <Text style={styles.detailLabel}>Ordered</Text>
            <Text style={styles.detailValue}>{item.date}</Text>
          </View>
          <View style={styles.orderDetailItem}>
            <Text style={styles.detailLabel}>
              {item.status === 'Delivered' ? 'Completed' : 'Est. Completion'}
            </Text>
            <Text style={styles.detailValue}>{item.estimatedCompletion}</Text>
          </View>
        </View>

        <View style={styles.orderFooter}>
          <Text style={styles.orderPrice}>{item.price}</Text>
          <TouchableOpacity style={styles.detailsButton}>
            <Text style={styles.detailsButtonText}>VIEW DETAILS</Text>
          </TouchableOpacity>
        </View>

        {item.status === 'In Production' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: '45%' }]} />
            </View>
            <Text style={styles.progressText}>45% Complete</Text>
          </View>
        )}

        {item.status === 'Fitting Scheduled' && (
          <View style={styles.fittingNotice}>
            <Text style={styles.fittingIcon}>◎</Text>
            <Text style={styles.fittingText}>Fitting: April 12, 2026 at 2:00 PM</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Orders</Text>
          <Text style={styles.subtitle}>
            {activeCount} active {activeCount === 1 ? 'order' : 'orders'}
          </Text>
        </View>
        <TouchableOpacity style={styles.newOrderButton}>
          <Text style={styles.newOrderButtonText}>+ NEW</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'completed'] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Orders List */}
      <FlatList
        data={filteredOrders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>▤</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubtitle}>
              Your custom pieces and ready-to-wear orders will appear here.
            </Text>
            <TouchableOpacity style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>START SHOPPING</Text>
            </TouchableOpacity>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  newOrderButton: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  newOrderButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cream,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.ivory,
  },
  filterTabActive: {
    backgroundColor: COLORS.navy,
  },
  filterText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.warmGray,
  },
  filterTextActive: {
    color: COLORS.white,
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  orderCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.cream,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.warmGray,
    letterSpacing: 0.5,
  },
  orderType: {
    fontSize: 12,
    color: COLORS.warmGray,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  productName: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 14,
  },
  orderDetails: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 14,
  },
  orderDetailItem: {},
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.warmGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    color: COLORS.navy,
    fontWeight: '500',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.cream,
  },
  orderPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.navy,
  },
  detailsButton: {
    borderWidth: 1,
    borderColor: COLORS.navy,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  detailsButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 1,
  },
  progressContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.cream,
  },
  progressTrack: {
    height: 4,
    backgroundColor: COLORS.cream,
    borderRadius: 2,
    marginBottom: 6,
  },
  progressFill: {
    height: 4,
    backgroundColor: COLORS.crimson,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 13,
    color: COLORS.warmGray,
    fontWeight: '500',
  },
  fittingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.cream,
    gap: 8,
  },
  fittingIcon: {
    fontSize: 18,
    color: COLORS.crimson,
  },
  fittingText: {
    fontSize: 15,
    color: COLORS.navy,
    fontWeight: '600',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 54,
    color: COLORS.cream,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 23,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: COLORS.warmGray,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.crimson,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 4,
  },
  emptyButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
