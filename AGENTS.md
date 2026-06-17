# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.
IMPORTANT RULES — DO NOT BREAK THE PROJECT:

1. DO NOT install new dependencies
2. DO NOT remove dependencies
3. DO NOT upgrade package versions
4. DO NOT modify package.json unless absolutely necessary
5. DO NOT touch babel.config.js
6. DO NOT touch metro.config.js
7. DO NOT touch tsconfig.json
8. DO NOT touch app.json
9. DO NOT modify Expo Router architecture
10. DO NOT break existing navigation
11. DO NOT change backend logic
12. DO NOT rewrite working components unnecessarily
13. ONLY modify frontend UI and styling
14. Keep all existing functionality working
15. Maintain Expo SDK 55 compatibility
16. Keep app lightweight and performant
17. Do not introduce TypeScript errors
18. Do not remove existing code unless necessary
19. Preserve all current features
20. Focus ONLY on UI/UX improvements

Before making changes:
- analyze current structure first
- reuse existing components
- make incremental safe improvements
- avoid risky refactors

The app MUST still run successfully using:
npx expo start

WITHOUT ERRORS after changes.

---

## 21. Database ObjectId Hardcoding Rule
Always ensure that the `_id` (ObjectId) for all default seed folders and cards are statically hardcoded in `staticIds.ts` (in the backend seeder directory). Never generate them dynamically with random IDs, and do not change existing hardcoded IDs as it will break the client app offline synchronization and result in duplicate folders/cards. If new folders or cards are added, their IDs must be generated deterministically and added to `staticIds.ts`.