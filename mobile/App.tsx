import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <TouchableOpacity>
          <Text style={styles.headerButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AWULA_K</Text>
        <TouchableOpacity>
          <Text style={styles.headerButton}>⋯</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.main}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Collection hero</Text>
          <Text style={styles.heroSubtitle}>New Month • Signature Collection</Text>
          <Text style={styles.heroText}>Luxury custom looks, partner picks, and premium bookings in one place.</Text>
        </View>
        <View style={styles.options}>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Ready to wear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Custom design</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Book consult</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.featured}>
          <View style={styles.featuredHeader}>
            <Text style={styles.sectionTitle}>Featured pieces</Text>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.product}>
            <Image source={{uri: 'https://via.placeholder.com/300'}} style={styles.productImage} />
            <Text style={styles.productTitle}>Blue evening look</Text>
            <Text style={styles.productDesc}>Shop now or convert to a custom fit request.</Text>
          </View>
          <View style={styles.product}>
            <Image source={{uri: 'https://via.placeholder.com/300'}} style={styles.productImage} />
            <Text style={styles.productTitle}>Olive celebration piece</Text>
            <Text style={styles.productDesc}>Saved with fit notes, styling ideas, and fabric options.</Text>
          </View>
        </View>
      </ScrollView>
      <View style={styles.nav}>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navTextActive}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navText}>Consults</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerButton: {
    fontSize: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  main: {
    flex: 1,
    padding: 16,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#666',
    marginVertical: 4,
  },
  heroText: {
    fontSize: 14,
    textAlign: 'center',
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  button: {
    backgroundColor: 'black',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
  },
  featured: {
    flex: 1,
  },
  featuredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  viewAll: {
    fontSize: 14,
    color: '#666',
  },
  product: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  productImage: {
    width: '100%',
    height: 200,
    borderRadius: 4,
    marginBottom: 8,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  productDesc: {
    fontSize: 14,
    color: '#666',
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'white',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 14,
    color: '#666',
  },
  navTextActive: {
    fontSize: 14,
    color: 'black',
    fontWeight: 'bold',
  },
});
