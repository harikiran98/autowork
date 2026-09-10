import { create } from 'zustand'
import { deleteFile, listFiles, uploadFile, type WorkspaceFile } from '../api/client'

interface FilesState {
  files: WorkspaceFile[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  add: (file: File) => Promise<void>
  remove: (name: string) => Promise<void>
}

/**
 * Browser-local workspace. File contents never leave the device until the user
 * explicitly attaches them to a model task; this also works on Netlify where a
 * function has no durable filesystem.
 */
export const useFiles = create<FilesState>((set, get) => ({
  files: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true })
    const files = await listFiles()
    set({ files, loading: false })
  },

  add: async (file) => {
    set({ error: null })
    try {
      // Binary files would arrive as mojibake and waste tokens, so the storage
      // layer accepts only its explicit text/code allowlist.
      const text = await file.text()
      await uploadFile(file.name, text)
      await get().refresh()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Upload failed.' })
    }
  },

  remove: async (name) => {
    set({ error: null })
    try {
      await deleteFile(name)
      await get().refresh()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Delete failed.' })
    }
  },
}))
