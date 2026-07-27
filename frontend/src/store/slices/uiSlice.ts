import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Use a plain string array instead of Set to keep the slice serializable
interface UiState {
  replyingTo: string | null;
  editingComment: string | null;
  expandedComments: string[]; // comment ids that are manually collapsed
}

const initialState: UiState = {
  replyingTo: null,
  editingComment: null,
  expandedComments: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setReplyingTo(state, action: PayloadAction<string | null>) {
      state.replyingTo = action.payload;
      if (action.payload !== null) state.editingComment = null;
    },
    setEditingComment(state, action: PayloadAction<string | null>) {
      state.editingComment = action.payload;
      if (action.payload !== null) state.replyingTo = null;
    },
    collapseComment(state, action: PayloadAction<string>) {
      if (!state.expandedComments.includes(action.payload)) {
        state.expandedComments.push(action.payload);
      }
    },
    expandComment(state, action: PayloadAction<string>) {
      state.expandedComments = state.expandedComments.filter((id) => id !== action.payload);
    },
    clearUiState(state) {
      state.replyingTo = null;
      state.editingComment = null;
      state.expandedComments = [];
    },
  },
});

export const {
  setReplyingTo,
  setEditingComment,
  collapseComment,
  expandComment,
  clearUiState,
} = uiSlice.actions;

export default uiSlice.reducer;
