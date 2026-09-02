(struct_declaration
  "struct" @context
  name: (_) @name) @item

(class_declaration
  "class" @context
  name: (_) @name) @item

(abstract_class_declaration
  "abstract" @context
  "class" @context
  name: (_) @name) @item

(annotation_declaration
  name: (_) @name) @item

(interface_declaration
  "interface" @context
  name: (_) @name) @item

(enum_declaration
  "enum" @context
  name: (_) @name) @item

(type_alias_declaration
  "type" @context
  name: (_) @name) @item

(function_signature
  name: (_) @name
  parameters: (formal_parameters) @context) @item

(method_definition
  name: (_) @name
  parameters: (formal_parameters) @context) @item

(method_signature
  name: (_) @name
  parameters: (formal_parameters) @context) @item

(abstract_method_signature
  name: (_) @name
  parameters: (formal_parameters) @context) @item

(public_field_definition
  name: (_) @name) @item

(property_signature
  name: (_) @name) @item

(comment) @annotation
