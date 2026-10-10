import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createJSONStorage } from 'zustand/middleware';

/** JSON storage for persisted zustand stores (non-sensitive data only). */
export const jsonStorage = createJSONStorage(() => AsyncStorage);

const API_KEY_ITEM = 'twelvedata.apiKey';

/** The API key lives in the Android Keystore-backed secure store, never in AsyncStorage. */
export const apiKeyStorage = {
  get: () => SecureStore.getItemAsync(API_KEY_ITEM),
  set: (value: string) => SecureStore.setItemAsync(API_KEY_ITEM, value.trim()),
  clear: () => SecureStore.deleteItemAsync(API_KEY_ITEM),
};
