import React from 'react';
import { TouchableOpacity, Text, TouchableOpacityProps, View } from 'react-native';

export interface ButtonProps extends TouchableOpacityProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'none';
  title?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  title,
  icon,
  iconRight,
  className = '',
  ...props
}) => {
  const baseStyle = "flex-row items-center justify-center";
  
  const variants = {
    primary: "bg-[#0F172A] shadow-[0_4px_16px_rgba(0,0,0,0.12)]",
    secondary: "bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]",
    ghost: "bg-[#FAFAF8] border border-slate-100",
    icon: "bg-white border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
  };
  
  const sizes = { none: "", sm: "py-3 px-4 rounded-[20px]", md: "py-4 px-6 rounded-[20px]", lg: "py-5 px-8 rounded-[24px]" };
  const buttonSize = variant === 'icon' ? 'p-3 rounded-[12px]' : sizes[size];

  const textStyles = {
    primary: "text-white font-medium text-[15px]",
    secondary: "text-[#0F172A] font-medium text-[14px]",
    ghost: "text-[#64748B] font-medium text-[14px]",
    icon: ""
  };

  return (
    <TouchableOpacity activeOpacity={variant === 'ghost' ? 0.7 : 0.8} className={`${baseStyle} ${variants[variant]} ${buttonSize} ${className}`} {...props}>
      {icon && <View className={title ? "mr-2" : ""}>{icon}</View>}
      {title && <Text className={textStyles[variant]}>{title}</Text>}
      {iconRight && <View className={title ? "ml-2" : ""}>{iconRight}</View>}
    </TouchableOpacity>
  );
};