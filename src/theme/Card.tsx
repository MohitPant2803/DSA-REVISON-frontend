import React from 'react';
import { View, ViewProps } from 'react-native';

export interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'modal' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({ 
  variant = 'default', 
  padding = 'md',
  className = '', 
  children, 
  ...props 
}) => {
  const variants = {
    default: "bg-white border border-slate-100 rounded-[20px] shadow-[0_2px_8px_rgba(0,0,0,0.02)]",
    elevated: "bg-white border border-slate-100 rounded-[28px] shadow-[0_4px_16px_rgba(0,0,0,0.02)]",
    modal: "bg-[#FAFAF8] rounded-t-[28px] shadow-[0_-10px_40px_rgba(0,0,0,0.1)]",
    ghost: "bg-[#FAFAF8] border border-slate-100 rounded-[20px]"
  };
  const paddings = { none: "", sm: "p-4", md: "p-5", lg: "p-6" };
  
  return (
    <View className={`${variants[variant]} ${paddings[padding]} ${className}`} {...props}>
      {children}
    </View>
  );
};