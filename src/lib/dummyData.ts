import { Sheet, Placard, PersonalFolder } from '../types';

export const sheets: Sheet[] = [
  {
    id: 'neetcode-150',
    title: 'Neetcode 150',
    description: 'The best 150 LeetCode problems to learn data structures and algorithms.',
    totalQuestions: 150,
    completedQuestions: 25,
  },
  {
    id: 'striver-sde',
    title: 'Striver SDE Sheet',
    description: 'Top coding interview questions for top tech companies.',
    totalQuestions: 190,
    completedQuestions: 10,
  },
  {
    id: 'blind-75',
    title: 'Blind 75',
    description: 'The 75 most important LeetCode questions.',
    totalQuestions: 75,
    completedQuestions: 50,
  }
];

export const placards: Placard[] = [
  // Neetcode 150
  {
    id: 'p1',
    title: 'Two Sum',
    topic: 'Arrays & Hashing',
    difficulty: 'Easy',
    questionText: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    sheetId: 'neetcode-150',
    isCompleted: true,
    codeSnippet: 'function twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n}'
  },
  {
    id: 'p2',
    title: 'Best Time to Buy and Sell Stock',
    topic: 'Sliding Window',
    difficulty: 'Easy',
    questionText: 'You are given an array prices where prices[i] is the price of a given stock on the ith day. You want to maximize your profit by choosing a single day to buy one stock and choosing a different day in the future to sell that stock.',
    sheetId: 'neetcode-150',
    isCompleted: false,
  },
  {
    id: 'p3',
    title: 'Longest Substring Without Repeating Characters',
    topic: 'Sliding Window',
    difficulty: 'Medium',
    questionText: 'Given a string s, find the length of the longest substring without repeating characters.',
    sheetId: 'neetcode-150',
    isCompleted: true,
  },
  {
    id: 'p4',
    title: 'Contains Duplicate',
    topic: 'Arrays & Hashing',
    difficulty: 'Easy',
    questionText: 'Given an integer array nums, return true if any value appears at least twice in the array, and return false if every element is distinct.',
    sheetId: 'neetcode-150',
    isCompleted: false,
  },
  // Striver SDE
  {
    id: 's1',
    title: 'Set Matrix Zeroes',
    topic: 'Arrays',
    difficulty: 'Medium',
    questionText: 'Given an m x n integer matrix, if an element is 0, set its entire row and column to 0\'s.',
    sheetId: 'striver-sde',
    isCompleted: true,
  },
  {
    id: 's2',
    title: 'Pascal\'s Triangle',
    topic: 'Arrays',
    difficulty: 'Easy',
    questionText: 'Given an integer numRows, return the first numRows of Pascal\'s triangle.',
    sheetId: 'striver-sde',
    isCompleted: false,
  },
  // Blind 75
  {
    id: 'b1',
    title: '3Sum',
    topic: 'Two Pointers',
    difficulty: 'Medium',
    questionText: 'Given an integer array nums, return all the triplets [nums[i], nums[j], nums[k]] such that i != j, i != k, and j != k, and nums[i] + nums[j] + nums[k] == 0.',
    sheetId: 'blind-75',
    isCompleted: false,
  },
  {
    id: 'b2',
    title: 'Merge Intervals',
    topic: 'Intervals',
    difficulty: 'Medium',
    questionText: 'Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.',
    sheetId: 'blind-75',
    isCompleted: true,
  }
];

export const personalFolders: PersonalFolder[] = [
  {
    id: 'folder-1',
    name: 'My Custom DP Problems',
    totalQuestions: 12,
    lastUpdated: '2 days ago',
    progress: 75,
  },
  {
    id: 'folder-2',
    name: 'Graph Interview Prep',
    totalQuestions: 25,
    lastUpdated: '1 week ago',
    progress: 30,
  }
];