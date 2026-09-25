/**
 * Library module — TableMeta for the host project's generic dashboard CRUD.
 *
 * Returning `custom: false` means the host's generic list/form/detail, advanced
 * filters and soft-delete apply to the library tables for free. Field labels
 * resolve through the module's own i18n files
 * (`dashboard.fields.<table>.<field>` / `dashboard.tables.<table>`), with the
 * English `label` below only acting as a fallback.
 */
// Type-only import from the host (erased at build time — the runtime value
// lives in this module). Structural typing lets us pass plain TableMeta objects.
import type { FieldMeta, TableMeta } from '../../../../app/types/dashboard'

const idField = (): FieldMeta => ({
  key: 'id', label: 'ID', type: 'number', nullable: false,
  showInForm: false, showInTable: true, showInDetail: true, editable: false,
  widthClass: 'w-16'
})

const createdAtField = (): FieldMeta => ({
  key: 'createdAt', label: 'Created at', type: 'datetime', nullable: false,
  showInForm: false, showInTable: true, showInDetail: true, editable: false,
  widthClass: 'w-40'
})

const updatedAtField = (): FieldMeta => ({
  key: 'updatedAt', label: 'Updated at', type: 'datetime', nullable: false,
  showInForm: false, showInTable: false, showInDetail: true, editable: false
})

const deletedAtField = (): FieldMeta => ({
  key: 'deletedAt', label: 'Deleted at', type: 'datetime', nullable: true,
  showInForm: false, showInTable: false, showInDetail: true, editable: false
})

export const libCategoryMeta: TableMeta = {
  table: 'libCategories',
  label: 'Library Categories',
  icon: 'i-lucide-folder-tree',
  custom: false,
  fields: [
    idField(),
    { key: 'name', label: 'Name', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 120 } },
    { key: 'slug', label: 'Slug', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 160 } },
    { key: 'description', label: 'Description', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    { key: 'icon', label: 'Icon', type: 'icon', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, helpText: 'Iconify class (e.g. i-lucide-book-open).' },
    { key: 'sortOrder', label: 'Sort order', type: 'number', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true },
    { key: 'isActive', label: 'Active', type: 'boolean', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true },
    createdAtField(),
    updatedAtField(),
    deletedAtField()
  ],
  features: {
    softDelete: true,
    search: ['name', 'slug', 'description'],
    defaultSort: { field: 'sortOrder', order: 'asc' }
  }
}

export const libAuthorMeta: TableMeta = {
  table: 'libAuthors',
  label: 'Library Authors',
  icon: 'i-lucide-user-pen',
  custom: false,
  fields: [
    idField(),
    { key: 'name', label: 'Name', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 255 } },
    { key: 'sortName', label: 'Sort name', type: 'text', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { maxLength: 255 }, helpText: 'Sortable form, e.g. "Asimov, Isaac".' },
    { key: 'avatar', label: 'Avatar', type: 'image', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, widthClass: 'w-20' },
    { key: 'description', label: 'Biography', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    createdAtField(),
    updatedAtField(),
    deletedAtField()
  ],
  features: {
    softDelete: true,
    search: ['name', 'sortName', 'description'],
    defaultSort: { field: 'name', order: 'asc' }
  }
}

export const libSeriesMeta: TableMeta = {
  table: 'libSeries',
  label: 'Library Series',
  icon: 'i-lucide-library',
  custom: false,
  fields: [
    idField(),
    { key: 'name', label: 'Name', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 255 } },
    { key: 'description', label: 'Description', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    createdAtField(),
    updatedAtField(),
    deletedAtField()
  ],
  features: {
    softDelete: true,
    search: ['name', 'description'],
    defaultSort: { field: 'name', order: 'asc' }
  }
}

export const libPublisherMeta: TableMeta = {
  table: 'libPublishers',
  label: 'Library Publishers',
  icon: 'i-lucide-building-2',
  custom: false,
  fields: [
    idField(),
    { key: 'name', label: 'Name', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 255 } },
    { key: 'description', label: 'Description', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    createdAtField(),
    updatedAtField(),
    deletedAtField()
  ],
  features: {
    softDelete: true,
    search: ['name', 'description'],
    defaultSort: { field: 'name', order: 'asc' }
  }
}

export const libBookMeta: TableMeta = {
  table: 'libBooks',
  label: 'Library Books',
  icon: 'i-lucide-book-open',
  custom: false,
  fields: [
    idField(),
    { key: 'cover', label: 'Cover', type: 'image', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, widthClass: 'w-20' },
    { key: 'title', label: 'Title', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 500 } },
    { key: 'subtitle', label: 'Subtitle', type: 'text', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, validation: { maxLength: 500 } },
    { key: 'sortTitle', label: 'Sort title', type: 'text', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, validation: { maxLength: 500 } },
    { key: 'seriesId', label: 'Series', type: 'relation', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, relation: { table: 'libSeries', labelKey: 'name', valueKey: 'id', creatable: true } },
    { key: 'seriesIndex', label: 'Series index', type: 'number', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { min: 0, step: 0.1 } },
    { key: 'publisherId', label: 'Publisher', type: 'relation', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, relation: { table: 'libPublishers', labelKey: 'name', valueKey: 'id', creatable: true } },
    { key: 'categoryId', label: 'Category', type: 'relation', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libCategories', labelKey: 'name', valueKey: 'id', creatable: true, slugField: 'slug' } },
    { key: 'pubdate', label: 'Published at', type: 'datetime', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    { key: 'isbn', label: 'ISBN', type: 'text', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, validation: { maxLength: 32 } },
    { key: 'language', label: 'Language', type: 'text', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, validation: { maxLength: 16 } },
    { key: 'pages', label: 'Pages', type: 'number', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, validation: { min: 0 } },
    { key: 'words', label: 'Words', type: 'number', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, validation: { min: 0 } },
    { key: 'rating', label: 'Rating', type: 'number', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { min: 0, max: 10, step: 0.1 }, helpText: '0–10 scale.' },
    { key: 'tags', label: 'Tags', type: 'tags', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true },
    { key: 'description', label: 'Description', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    { key: 'fileCount', label: 'Files', type: 'number', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false },
    { key: 'fileSize', label: 'Size (bytes)', type: 'number', nullable: false, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'viewCount', label: 'Views', type: 'number', nullable: false, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'readCount', label: 'Reads', type: 'number', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false },
    { key: 'downloadCount', label: 'Downloads', type: 'number', nullable: false, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'favoriteCount', label: 'Favorites', type: 'number', nullable: false, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'isPublic', label: 'Public', type: 'boolean', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, helpText: 'Private books are visible only to their owner and admins.' },
    { key: 'isActive', label: 'Active', type: 'boolean', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true },
    { key: 'userId', label: 'Added by', type: 'relation', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    createdAtField(),
    updatedAtField(),
    deletedAtField()
  ],
  features: {
    softDelete: true,
    search: ['title', 'subtitle', 'isbn', 'description'],
    defaultSort: { field: 'createdAt', order: 'desc' }
  }
}

export const libBookAuthorMeta: TableMeta = {
  table: 'libBookAuthors',
  label: 'Library Book Authors',
  icon: 'i-lucide-link-2',
  custom: false,
  fields: [
    idField(),
    { key: 'bookId', label: 'Book', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libBooks', labelKey: 'title', valueKey: 'id' } },
    { key: 'authorId', label: 'Author', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libAuthors', labelKey: 'name', valueKey: 'id', creatable: true } },
    createdAtField()
  ],
  features: {
    softDelete: false,
    search: [],
    defaultSort: { field: 'id', order: 'desc' }
  }
}

export const libBookFileMeta: TableMeta = {
  table: 'libBookFiles',
  label: 'Library Book Files',
  icon: 'i-lucide-file-archive',
  custom: false,
  fields: [
    idField(),
    { key: 'bookId', label: 'Book', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libBooks', labelKey: 'title', valueKey: 'id' } },
    { key: 'format', label: 'Format', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 16 } },
    { key: 'originalName', label: 'File name', type: 'text', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false },
    { key: 'path', label: 'Path', type: 'text', nullable: false, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'mimeType', label: 'MIME', type: 'text', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'size', label: 'Size', type: 'number', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false, widthClass: 'w-24' },
    { key: 'hash', label: 'Hash', type: 'text', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'isPrimary', label: 'Primary', type: 'boolean', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true },
    { key: 'userId', label: 'Uploaded by', type: 'relation', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    createdAtField(),
    updatedAtField(),
    deletedAtField()
  ],
  features: {
    softDelete: true,
    search: ['originalName', 'format'],
    defaultSort: { field: 'createdAt', order: 'desc' }
  }
}

export const libReadingProgressMeta: TableMeta = {
  table: 'libReadingProgress',
  label: 'Library Reading Progress',
  icon: 'i-lucide-bookmark-check',
  custom: false,
  fields: [
    idField(),
    { key: 'bookId', label: 'Book', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libBooks', labelKey: 'title', valueKey: 'id' } },
    { key: 'userId', label: 'User', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    {
      key: 'status', label: 'Status', type: 'select', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true,
      options: [
        { label: 'Unread', value: 'unread' },
        { label: 'Reading', value: 'reading' },
        { label: 'Finished', value: 'finished' }
      ]
    },
    { key: 'percent', label: 'Percent', type: 'number', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { min: 0, max: 100, step: 0.1 } },
    { key: 'chapterIndex', label: 'Chapter', type: 'number', nullable: false, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'location', label: 'Location', type: 'text', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'startedAt', label: 'Started at', type: 'datetime', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'finishedAt', label: 'Finished at', type: 'datetime', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'lastReadAt', label: 'Last read at', type: 'datetime', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false, widthClass: 'w-40' },
    createdAtField(),
    updatedAtField()
  ],
  features: {
    softDelete: false,
    search: ['status'],
    defaultSort: { field: 'lastReadAt', order: 'desc' }
  }
}

export const libBookmarkMeta: TableMeta = {
  table: 'libBookmarks',
  label: 'Library Bookmarks',
  icon: 'i-lucide-highlighter',
  custom: false,
  fields: [
    idField(),
    { key: 'bookId', label: 'Book', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libBooks', labelKey: 'title', valueKey: 'id' } },
    { key: 'userId', label: 'User', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    {
      key: 'type', label: 'Type', type: 'select', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true,
      options: [
        { label: 'Bookmark', value: 'bookmark' },
        { label: 'Highlight', value: 'highlight' },
        { label: 'Note', value: 'note' }
      ]
    },
    { key: 'text', label: 'Text', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    { key: 'note', label: 'Note', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    { key: 'color', label: 'Color', type: 'text', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { maxLength: 24 } },
    {
      key: 'style', label: 'Style', type: 'select', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true,
      options: [
        { label: 'Highlight', value: 'highlight' },
        { label: 'Underline', value: 'underline' },
        { label: 'Double underline', value: 'double' },
        { label: 'Dotted underline', value: 'dotted' },
        { label: 'Dashed underline', value: 'dashed' },
        { label: 'Wavy underline', value: 'wavy' }
      ]
    },
    { key: 'startOffset', label: 'Start offset', type: 'number', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'endOffset', label: 'End offset', type: 'number', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'chapterIndex', label: 'Chapter', type: 'number', nullable: false, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    { key: 'percent', label: 'Percent', type: 'number', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false },
    { key: 'location', label: 'Location', type: 'text', nullable: true, showInForm: false, showInTable: false, showInDetail: true, editable: false },
    createdAtField(),
    updatedAtField(),
    deletedAtField()
  ],
  features: {
    softDelete: true,
    search: ['text', 'note'],
    defaultSort: { field: 'createdAt', order: 'desc' }
  }
}

export const libCollectionMeta: TableMeta = {
  table: 'libCollections',
  label: 'Library Collections',
  icon: 'i-lucide-list',
  custom: false,
  fields: [
    idField(),
    { key: 'name', label: 'Name', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 200 } },
    { key: 'slug', label: 'Slug', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 220 } },
    { key: 'description', label: 'Description', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    { key: 'cover', label: 'Cover', type: 'image', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, widthClass: 'w-20' },
    { key: 'userId', label: 'Owner', type: 'relation', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    { key: 'isPublic', label: 'Public', type: 'boolean', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true },
    { key: 'sortOrder', label: 'Sort order', type: 'number', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true },
    createdAtField(),
    updatedAtField(),
    deletedAtField()
  ],
  features: {
    softDelete: true,
    search: ['name', 'slug', 'description'],
    defaultSort: { field: 'sortOrder', order: 'asc' }
  }
}

export const libCollectionBookMeta: TableMeta = {
  table: 'libCollectionBooks',
  label: 'Library Collection Books',
  icon: 'i-lucide-link-2',
  custom: false,
  fields: [
    idField(),
    { key: 'collectionId', label: 'Collection', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libCollections', labelKey: 'name', valueKey: 'id' } },
    { key: 'bookId', label: 'Book', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libBooks', labelKey: 'title', valueKey: 'id' } },
    createdAtField()
  ],
  features: {
    softDelete: false,
    search: [],
    defaultSort: { field: 'id', order: 'desc' }
  }
}

export const libFavoriteMeta: TableMeta = {
  table: 'libFavorites',
  label: 'Library Favorites',
  icon: 'i-lucide-heart',
  custom: false,
  fields: [
    idField(),
    { key: 'userId', label: 'User', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    { key: 'bookId', label: 'Book', type: 'relation', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'libBooks', labelKey: 'title', valueKey: 'id' } },
    createdAtField()
  ],
  features: {
    softDelete: false,
    search: [],
    defaultSort: { field: 'id', order: 'desc' }
  }
}
