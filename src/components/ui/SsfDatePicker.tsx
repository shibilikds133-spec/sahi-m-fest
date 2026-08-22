import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
  PanResponder,
  Platform,
} from 'react-native';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react-native';

import { ui } from '@/constants/designSystem';

export interface SsfDatePickerProps {
  value: string; // YYYY-MM-DD
  onValueChange: (value: string) => void;
  placeholder?: string;
  width?: number;
  style?: ViewStyle;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function SsfDatePicker({
  value,
  onValueChange,
  placeholder = 'Pick a date',
  width,
  style,
}: SsfDatePickerProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  
  const anchorRef = useRef<View>(null);
  const [menuTop, setMenuTop] = useState(0);
  const [menuLeft, setMenuLeft] = useState(0);

  // Parse initial value or use today
  const initialDate = useMemo(() => {
    if (!value) return new Date();
    const parts = value.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date();
  }, [value]);

  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth());
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());

  useEffect(() => {
    if (open) {
      setCurrentMonth(initialDate.getMonth());
      setCurrentYear(initialDate.getFullYear());
      
      anchorRef.current?.measureInWindow((x, y, w, h) => {
        let top = y + h + 8;
        let left = x;
        const menuWidth = 320;
        const menuHeight = 360;

        if (top + menuHeight > screenHeight) {
          top = y - menuHeight - 8;
        }
        if (left + menuWidth > screenWidth) {
          left = screenWidth - menuWidth - 16;
        }
        
        setMenuTop(Math.max(16, top));
        setMenuLeft(Math.max(16, left));
      });
    }
  }, [open, initialDate, screenWidth, screenHeight]);

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const changeMonth = (delta: number) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          changeMonth(-1); // Swipe Right -> Prev
        } else if (gestureState.dx < -50) {
          changeMonth(1); // Swipe Left -> Next
        }
      },
    })
  ).current;

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const selectedDate = value ? initialDate : null;

  const grid = [];
  let dayCounter = 1;
  for (let row = 0; row < 6; row++) {
    const week = [];
    for (let col = 0; col < 7; col++) {
      if (row === 0 && col < firstDay) {
        week.push(null);
      } else if (dayCounter > daysInMonth) {
        week.push(null);
      } else {
        week.push(dayCounter);
        dayCounter++;
      }
    }
    grid.push(week);
    if (dayCounter > daysInMonth) break;
  }

  const handleSelectDate = (day: number) => {
    const yyyy = currentYear;
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onValueChange(`${yyyy}-${mm}-${dd}`);
    setOpen(false);
  };

  // Check if a day is today
  const today = new Date();
  const isToday = (day: number) => {
    return today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
  };

  // Check if a day is selected
  const isSelected = (day: number) => {
    return selectedDate?.getDate() === day && selectedDate?.getMonth() === currentMonth && selectedDate?.getFullYear() === currentYear;
  };

  // Display value formatting (e.g. "Oct 12, 2026")
  const displayValue = useMemo(() => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [value]);

  return (
    <>
      <Pressable
        ref={anchorRef}
        onPress={() => setOpen(true)}
        style={[styles.trigger, width ? { width } : {}, style]}
      >
        <Text style={[styles.triggerText, !value && styles.placeholderText]}>
          {value ? displayValue : placeholder}
        </Text>
        <CalendarIcon size={16} color={ui.colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.popover,
              Platform.OS === 'web' ? { top: menuTop, left: menuLeft } : styles.mobilePopover
            ]}
          >
            <View style={styles.header}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navButton}>
                <ChevronLeft size={20} color={ui.colors.text} />
              </TouchableOpacity>
              <Text style={styles.headerText}>
                {MONTHS[currentMonth]} {currentYear}
              </Text>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navButton}>
                <ChevronRight size={20} color={ui.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarBody} {...panResponder.panHandlers}>
              <View style={styles.weekRow}>
                {DAYS.map((d, i) => (
                  <Text key={i} style={styles.dayLabel}>{d}</Text>
                ))}
              </View>

              {grid.map((week, rIndex) => (
                <View key={rIndex} style={styles.weekRow}>
                  {week.map((day, cIndex) => {
                    if (!day) return <View key={cIndex} style={styles.dayCell} />;
                    
                    const selected = isSelected(day);
                    const currentToday = isToday(day);

                    return (
                      <TouchableOpacity
                        key={cIndex}
                        style={[
                          styles.dayCell,
                          selected && styles.dayCellSelected,
                          currentToday && !selected && styles.dayCellToday
                        ]}
                        onPress={() => handleSelectDate(day)}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            selected && styles.dayTextSelected,
                            currentToday && !selected && styles.dayTextToday
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerText: {
    flex: 1,
    color: '#334155',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  placeholderText: {
    color: ui.colors.textSubtle,
  },
  mobilePopover: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -160 }, { translateY: -180 }],
  },
  popover: {
    position: 'absolute',
    width: 320,
    backgroundColor: ui.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.colors.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: ui.colors.text,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
  },
  calendarBody: {
    flexDirection: 'column',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayLabel: {
    width: 36,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: ui.colors.textMuted,
  },
  dayCell: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  dayCellSelected: {
    backgroundColor: ui.colors.primary,
  },
  dayCellToday: {
    backgroundColor: ui.colors.surfaceMuted,
  },
  dayText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: ui.colors.text,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
  },
  dayTextToday: {
    color: ui.colors.primary,
    fontFamily: 'Poppins_700Bold',
  },
});
