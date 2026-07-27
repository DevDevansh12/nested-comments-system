import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SocketState {
  connected: boolean;
  syncing: boolean;
  error: string | null;
}

const initialState: SocketState = {
  connected: false,
  syncing: false,
  error: null,
};

const socketSlice = createSlice({
  name: 'socket',
  initialState,
  reducers: {
    connect: (state) => {
      state.connected = true;
      state.error = null;
    },
    disconnect: (state) => {
      state.connected = false;
    },
    startSync: (state) => {
      state.syncing = true;
    },
    completeSync: (state) => {
      state.syncing = false;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const { connect, disconnect, startSync, completeSync, setError, clearError } = socketSlice.actions;
export default socketSlice.reducer;
