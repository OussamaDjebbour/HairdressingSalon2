-- The database linter (function_search_path_mutable) flags private.category_icon: it was created without a fixed
-- search_path. It only maps a category key to an icon name and nobody but definer functions can call it, so this
-- is hygiene, not a hole — but every other function here pins search_path, and so should this one.
alter function private.category_icon(text) set search_path = '';
