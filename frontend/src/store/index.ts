import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import commentsReducer from './slices/commentsSlice';
import socketReducer from './slices/socketSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    comments: commentsReducer,
    socket: socketReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these paths for serializable checks
        ignoredActions: ['socket/connect', 'socket/disconnect'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
