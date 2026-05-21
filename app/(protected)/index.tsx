import { Redirect } from 'expo-router';

export default function ProtectedHome() {
  return <Redirect href="/(protected)/(tabs)/learn" />;
}
