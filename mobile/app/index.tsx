import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  ImageSourcePropType,
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

const { width } = Dimensions.get('window');

interface FeaturedProduct {
  id: string;
  title: string;
  description: string;
  price: string;
  tag: string;
  image: ImageSourcePropType;
}

const FEATURED_PRODUCTS: FeaturedProduct[] = [
  {
    id: '1',
    title: 'Chartreuse Silk Beaded Gown',
    description: 'Hand-draped silk chiffon with custom beadwork. Available ready-to-wear or custom fit.',
    price: '$3,200',
    tag: 'New Arrival',
    image: require('../assets/img-chartreuse-gown.jpg'),
  },
  {
    id: '2',
    title: 'Olive Art-Deco Mermaid',
    description: 'Structured bodice with flowing skirt. Includes fabric swatches and fit notes.',
    price: '$3,800',
    tag: 'Bestseller',
    image: require('../assets/img-mermaid-gown.jpg'),
  },
  {
    id: '3',
    title: 'Gold Sequin Column Dress',
    description: 'Modern column silhouette with hand-applied sequin overlay.',
    price: '$2,400',
    tag: 'Custom Only',
    image: require('../assets/img-gold-dress.jpg'),
  },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logoMark}>AK</Text>
        </View>
        <Text style={styles.logo}>AWULA_K</Text>
        <TouchableOpacity style={styles.headerRight}>
          <Text style={styles.cartIcon}>♦</Text>
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>2</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.heroImageWrapper}>
            <Image
              source={require('../assets/img-red-kaftan.jpg')}
              style={styles.heroImage}
              resizeMode="cover"
            />
            <View style={styles.heroImageOverlay} />
          </View>
          <View style={styles.heroOverlay}>
            <Text style={styles.heroLabel}>NEW COLLECTION</Text>
            <Text style={styles.heroTitle}>Signature{'\n'}Spring/Summer</Text>
            <Text style={styles.heroSubtitle}>
              Luxury custom looks, curated pieces, and premium consultations — all in one place.
            </Text>
            <TouchableOpacity style={styles.heroButton}>
              <Text style={styles.heroButtonText}>EXPLORE COLLECTION</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaSection}>
          <TouchableOpacity style={styles.ctaPrimary}>
            <Text style={styles.ctaPrimaryIcon}>✦</Text>
            <View style={styles.ctaTextGroup}>
              <Text style={styles.ctaPrimaryText}>Ready to Wear</Text>
              <Text style={styles.ctaSubtext}>Shop curated pieces</Text>
            </View>
            <Text style={styles.ctaArrow}>→</Text>
          </TouchableOpacity>

          <View style={styles.ctaRow}>
            <TouchableOpacity style={styles.ctaSecondary}>
              <Text style={styles.ctaSecondaryIcon}>◇</Text>
              <Text style={styles.ctaSecondaryText}>Custom Design</Text>
              <Text style={styles.ctaSecondarySubtext}>Bespoke creation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctaSecondary}>
              <Text style={styles.ctaSecondaryIcon}>◎</Text>
              <Text style={styles.ctaSecondaryText}>Book Consult</Text>
              <Text style={styles.ctaSecondarySubtext}>Personal styling</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Featured Products */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionLabel}>CURATED FOR YOU</Text>
              <Text style={styles.sectionTitle}>Featured Pieces</Text>
            </View>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View all →</Text>
            </TouchableOpacity>
          </View>

          {FEATURED_PRODUCTS.map((product) => (
            <TouchableOpacity key={product.id} style={styles.productCard}>
              <View style={styles.productImageContainer}>
                <Image
                  source={product.image}
                  style={styles.productImage}
                  resizeMode="cover"
                />
                <View style={styles.productTag}>
                  <Text style={styles.productTagText}>{product.tag}</Text>
                </View>
              </View>
              <View style={styles.productInfo}>
                <Text style={styles.productTitle}>{product.title}</Text>
                <Text style={styles.productDesc}>{product.description}</Text>
                <View style={styles.productFooter}>
                  <Text style={styles.productPrice}>{product.price}</Text>
                  <TouchableOpacity style={styles.productAction}>
                    <Text style={styles.productActionText}>VIEW</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Atelier Promise */}
        <View style={styles.promiseSection}>
          <Text style={styles.promiseLabel}>THE AWULA_K PROMISE</Text>
          <View style={styles.promiseGrid}>
            <View style={styles.promiseItem}>
              <Text style={styles.promiseIcon}>✦</Text>
              <Text style={styles.promiseTitle}>Custom Fit</Text>
              <Text style={styles.promiseDesc}>Every piece tailored to your measurements</Text>
            </View>
            <View style={styles.promiseItem}>
              <Text style={styles.promiseIcon}>◆</Text>
              <Text style={styles.promiseTitle}>Premium Fabrics</Text>
              <Text style={styles.promiseDesc}>Sourced from the finest mills worldwide</Text>
            </View>
            <View style={styles.promiseItem}>
              <Text style={styles.promiseIcon}>●</Text>
              <Text style={styles.promiseTitle}>Expert Craft</Text>
              <Text style={styles.promiseDesc}>Handmade by skilled artisans</Text>
            </View>
            <View style={styles.promiseItem}>
              <Text style={styles.promiseIcon}>◇</Text>
              <Text style={styles.promiseTitle}>Personal Service</Text>
              <Text style={styles.promiseDesc}>Dedicated stylist for every client</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>AWULA_K Atelier</Text>
          <Text style={styles.footerSubtext}>Luxury Fashion, Tailored to You</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cream,
  },
  headerLeft: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMark: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  logo: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 3,
  },
  headerRight: {
    position: 'relative',
    padding: 4,
  },
  cartIcon: {
    fontSize: 26,
    color: COLORS.navy,
  },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: COLORS.crimson,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  // Hero
  hero: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.navy,
  },
  heroImageWrapper: {
    height: 260,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27, 42, 91, 0.35)',
  },
  heroOverlay: {
    padding: 24,
    backgroundColor: COLORS.navy,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.crimson,
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '300',
    color: COLORS.white,
    lineHeight: 42,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 24,
    marginBottom: 20,
  },
  heroButton: {
    backgroundColor: COLORS.crimson,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  heroButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  // CTAs
  ctaSection: {
    padding: 16,
    gap: 12,
  },
  ctaPrimary: {
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cream,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  ctaPrimaryIcon: {
    fontSize: 28,
    color: COLORS.crimson,
    marginRight: 16,
  },
  ctaTextGroup: {
    flex: 1,
  },
  ctaPrimaryText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 2,
  },
  ctaSubtext: {
    fontSize: 15,
    color: COLORS.warmGray,
  },
  ctaArrow: {
    fontSize: 23,
    color: COLORS.warmGray,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  ctaSecondary: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cream,
    alignItems: 'center',
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  ctaSecondaryIcon: {
    fontSize: 28,
    color: COLORS.navy,
    marginBottom: 8,
  },
  ctaSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 2,
  },
  ctaSecondarySubtext: {
    fontSize: 14,
    color: COLORS.warmGray,
  },
  // Sections
  section: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.crimson,
    letterSpacing: 2,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.navy,
  },
  viewAll: {
    fontSize: 15,
    color: COLORS.crimson,
    fontWeight: '600',
  },
  // Product Cards
  productCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.cream,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  productImageContainer: {
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: 280,
  },
  productTag: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  productTagText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  productInfo: {
    padding: 16,
  },
  productTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 6,
  },
  productDesc: {
    fontSize: 15,
    color: COLORS.warmGray,
    lineHeight: 22,
    marginBottom: 14,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.navy,
  },
  productAction: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
  },
  productActionText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  // Promise Section
  promiseSection: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.cream,
  },
  promiseLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.crimson,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 20,
  },
  promiseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  promiseItem: {
    width: (width - 88) / 2,
    alignItems: 'center',
  },
  promiseIcon: {
    fontSize: 23,
    color: COLORS.navy,
    marginBottom: 8,
  },
  promiseTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 4,
    textAlign: 'center',
  },
  promiseDesc: {
    fontSize: 13,
    color: COLORS.warmGray,
    textAlign: 'center',
    lineHeight: 19,
  },
  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 2,
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 14,
    color: COLORS.warmGray,
  },
});
