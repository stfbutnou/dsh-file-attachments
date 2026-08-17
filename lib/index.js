export const name = 'dsh-file-attachments'

// The source patch is applied by the package lifecycle script before dsh boots.
// Keeping this runtime entry side-effect free makes normal dsh startup predictable.
export function apply() {}
