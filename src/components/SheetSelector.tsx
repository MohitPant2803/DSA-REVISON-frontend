import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { ChevronDown, X, BookMarked } from 'lucide-react-native';
import type { Sheet } from '../types';

export function SheetSelector() {
  const sheets = useAppStore(state => state.sheets);
  const selectedSheetId = useAppStore(state => state.selectedSheetId);
  const setSelectedSheetId = useAppStore(state => state.setSelectedSheetId);
  const [modalVisible, setModalVisible] = useState(false);

  const selectedSheet = sheets.find((s: Sheet) => s.id === selectedSheetId);

  const handleSelectSheet = (sheetId: string) => {
    setSelectedSheetId(sheetId);
    setModalVisible(false);
  };

  return (
    <>
      <View className="absolute top-12 left-0 right-0 z-10 items-center px-4 pt-2">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setModalVisible(true)}
          className="flex-row items-center bg-white/95 px-6 py-3.5 rounded-full border border-slate-200 shadow-lg shadow-slate-300/30 backdrop-blur-md"
        >
          <Text className="text-slate-900 font-black text-[15px] mr-2 tracking-wide">{selectedSheet?.title}</Text>
          <ChevronDown color="#64748b" size={20} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
          <View className="flex-1 justify-center items-center bg-slate-900/50 p-6 backdrop-blur-sm">
            <View className="bg-white rounded-[36px] w-full max-w-sm max-h-[75%] border border-slate-100 shadow-2xl overflow-hidden">
              <View className="flex-row justify-between items-center p-7 border-b border-slate-100/80 bg-slate-50/50">
                <Text className="text-slate-900 text-[22px] font-black tracking-tight">Select Journey</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setModalVisible(false)} className="bg-white p-2.5 rounded-full border border-slate-200 shadow-sm shadow-slate-100">
                  <X color="#64748b" size={22} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={sheets}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                    activeOpacity={0.8}
                  onPress={() => handleSelectSheet(item.id)}
                    className={`flex-row items-center p-4 mb-2.5 rounded-[24px] transition-all ${item.id === selectedSheetId ? 'bg-violet-50 border border-violet-100 shadow-sm shadow-violet-100/50' : 'bg-white border border-transparent hover:bg-slate-50'}`}
                >
                  <View className={`p-2 rounded-xl mr-3 ${item.id === selectedSheetId ? 'bg-violet-200/50' : 'bg-slate-100'}`}>
                    <BookMarked color={item.id === selectedSheetId ? '#7c3aed' : '#94a3b8'} size={20} />
                  </View>
                  <Text className={`flex-1 text-base font-bold ${item.id === selectedSheetId ? 'text-violet-700' : 'text-slate-600'}`}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}