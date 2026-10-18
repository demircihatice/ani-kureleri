import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ORTAK, RENKLER } from '../constants/tema';

export function SifreAlani(props: TextInputProps) {
  const [gorunur, ayarla] = useState(false);
  const label = `${props.accessibilityLabel ?? 'Şifre'}: Girilen şifreyi ${gorunur ? 'gizle' : 'göster'}`;
  return <View style={s.alan}>
    <TextInput {...props} style={[ORTAK.girdi, s.girdi]} secureTextEntry={!gorunur} />
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: props.editable === false, checked: gorunur }}
      disabled={props.editable === false} onPress={() => ayarla(!gorunur)} style={s.tus}>
      <Ionicons name={gorunur ? 'eye-outline' : 'eye-off-outline'} size={22} color={RENKLER.anaKoyu} accessible={false} />
    </Pressable>
  </View>;
}
const s = StyleSheet.create({ alan: { position: 'relative' }, girdi: { paddingRight: 56 },
  tus: { position: 'absolute', right: 2, top: 2, bottom: 2, minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' } });
