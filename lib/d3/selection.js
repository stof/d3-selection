var namespace = require("./namespace");

var document = global.document,
    CustomEvent = global.CustomEvent,
    Map = global.Map,
    slice = [].slice,
    filteredEvents = {mouseenter: "mouseover", mouseleave: "mouseout"},
    requoteRe = /[\\\^\$\*\+\?\|\[\]\(\)\.\{\}]/g;

(function() {
  if (document) {
    for (var type in filteredEvents) { // mouseenter, mouseleave polyfill
      if ("on" + type in document) {
        delete filteredEvents[type];
      }
    }

    if (!CustomEvent) { // CustomEvent polyfill
      CustomEvent = function(type, params) {
        var event = document.createEvent("CustomEvent");
        if (params) event.initCustomEvent(type, params.bubbles, params.cancelable, params.detail);
        else event.initCustomEvent(type, false, false, undefined);
        return event;
      };
      CustomEvent.prototype = global.Event.prototype;
    }

    if (!Map) { // Map polyfill
      Map = function() {};
      Map.prototype = {
        set: function(key, value) { this["$" + key] = value; return this; },
        get: function(key) { return this["$" + key]; },
        has: function(key) { return "$" + key in this; }
      };
    }
  }
})();

// For a flat selection, root = NodeList or [Node, …].
// For a one-level nested selection, root = [NodeList, NodeList, …].
// For a two-level nested selection, root = [[NodeList, …], …] etc.
function Selection(root, depth) {
  this._root = root;
  this._depth = depth;
}

Selection.prototype = {

  select: function(selector) {
    var depth = this._depth,
        stack = new Array(depth * 2);

    selector = selectorOf(selector);

    function visit(nodes, depth) {
      var i = -1,
          n = nodes.length,
          node,
          subnode,
          subnodes = new Array(n),
          stack0 = --depth * 2,
          stack1 = stack0 + 1;

      if (stack0) while (++i < n) {
        node = nodes[i];
        stack[stack0] = node._parent.__data__, stack[stack1] = i;
        subnodes[i] = visit(node, depth);
      }

      else while (++i < n) {
        if (node = nodes[i]) {
          stack[stack0] = node.__data__, stack[stack1] = i;
          if (subnode = selector.apply(node, stack)) {
            if ("__data__" in node) subnode.__data__ = node.__data__;
            subnodes[i] = subnode;
          }
        }
      }

      subnodes._parent = nodes._parent;
      return subnodes;
    }

    return new Selection(visit(this._root, depth), depth);
  },

  selectAll: function(selector) {
    var depth = this._depth,
        stack = new Array(depth * 2);

    selector = selectorAllOf(selector);

    function visit(nodes, depth) {
      var i = -1,
          n = nodes.length,
          node,
          subnode,
          subnodes = new Array(n),
          stack0 = --depth * 2,
          stack1 = stack0 + 1;

      if (stack0) while (++i < n) {
        node = nodes[i];
        stack[stack0] = node._parent.__data__, stack[stack1] = i;
        subnodes[i] = visit(node, depth);
      }

      else while (++i < n) {
        if (node = nodes[i]) {
          stack[stack0] = node.__data__, stack[stack1] = i;
          subnodes[i] = subnode = selector.apply(node, stack);
          subnode._parent = node;
        }
      }

      subnodes._parent = nodes._parent;
      return subnodes;
    }

    return new Selection(visit(this._root, depth), depth + 1);
  },

  filter: function(filter) {
    var depth = this._depth,
        stack = new Array(depth * 2);

    filter = filterOf(filter);

    function visit(nodes, depth) {
      var i = -1,
          n = nodes.length,
          node,
          subnodes,
          stack0 = --depth * 2,
          stack1 = stack0 + 1;

      if (stack0) {
        subnodes = new Array(n);
        while (++i < n) {
          node = nodes[i];
          stack[stack0] = node._parent.__data__, stack[stack1] = i;
          subnodes[i] = visit(node, depth);
        }
      }

      else {
        subnodes = [];
        while (++i < n) {
          if (node = nodes[i]) {
            stack[stack0] = node.__data__, stack[stack1] = i;
            if (filter.apply(node, stack)) {
              subnodes.push(node);
            }
          }
        }
      }

      subnodes._parent = nodes._parent;
      return subnodes;
    }

    return new Selection(visit(this._root, depth), depth);
  },

  // TODO in order to modify the update array in-place,
  // we must convert NodeLists to arrays!
  data: function(value, key) {
    var depth = this._depth,
        stack = new Array(depth * 2 - 2),
        bind = key ? bindByKey : bindByIndex,
        enter = this._enter || (this._enter = new EnterSelection(this, [], depth)),
        exit = this._exit || (this._exit = new Selection([], depth));

    value = valueOf(value);

    function visit(nodes, depth) {
      var i = -1,
          n = nodes.length,
          node,
          data,
          update,
          enter,
          exit,
          stack0 = --depth * 2,
          stack1 = stack0 + 1;

      if (stack0) {
        while (++i < n) {
          node = nodes[i];
          stack[stack0] = node._parent.__data__, stack[stack1] = i;
          visit(node, depth);
        }
      }

      else {
        while (++i < n) {
          node = nodes[i];
          stack[stack0] = node._parent.__data__, stack[stack1] = i;
          data = value.apply(node, stack);
          update = new Array(data.length);
          enter = new Array(data.length);
          exit = new Array(node.length);
          bind(node, data, update, enter, exit);
          nodes[i] = update;
          // TODO enter, exit?
        }
      }

      return nodes;
    }

    function bindByIndex(nodes, data, update, enter, exit) {
      var i = 0,
          nodeLength = nodes.length,
          dataLength = data.length,
          updateLength = Math.min(nodeLength, dataLength),
          node,
          datum;

      for (; i < updateLength; ++i) {
        node = nodes[i];
        datum = data[i];
        if (node) {
          node.__data__ = datum;
          update[i] = node;
        } else {
          enter[i] = new EnterNode(datum);
        }
      }

      for (; i < dataLength; ++i) {
        enter[i] = new EnterNode(data[i]);
      }

      for (; i < nodeLength; ++i) {
        exit[i] = nodes[i];
      }

      console.log("bindByIndex", update, enter, exit);
    }

    function bindByKey(group, groupData) {
    //     var nodeByKeyValue = new Map,
    //         keyValues = new Array(n),
    //         keyValue;

    //     for (i = -1; ++i < n;) {
    //       if (nodeByKeyValue.has(keyValue = key.call(node = group[i], node.__data__, i, j))) {
    //         exitGroup[i] = node; // duplicate selection key
    //       } else {
    //         nodeByKeyValue.set(keyValue, node);
    //       }
    //       keyValues[i] = keyValue;
    //     }

    //     for (i = -1; ++i < m;) {
    //       if (!(node = nodeByKeyValue.get(keyValue = key.call(groupData, nodeData = groupData[i], i)))) {
    //         enterGroup[i] = new EnterNode(nodeData);
    //       } else if (node !== true) { // no duplicate data key
    //         updateGroup[i] = node;
    //         node.__data__ = nodeData;
    //       }
    //       nodeByKeyValue.set(keyValue, true);
    //     }

    //     for (i = -1; ++i < n;) {
    //       if (nodeByKeyValue.get(keyValues[i]) !== true) {
    //         exitGroup[i] = group[i];
    //       }
    //     }
    }

    // var groups = this._,
    //     group,
    //     node,
    //     j = -1,
    //     m = groups.length;

    // if (!arguments.length) {
    //   var data = new Array(lengthOf(groups)),
    //       k = 0;
    //   while (++j < m) {
    //     for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i, ++k) {
    //       if (node = group[i]) data[k] = node.__data__;
    //     }
    //   }
    //   return data;
    // }

    // var enterGroups = this.enter()._,
    //     exitGroups = this.exit()._;

    // function bind(group, groupData, j) {
    //   var i,
    //       n = group.length,
    //       m = groupData.length,
    //       n0 = Math.min(n, m),
    //       updateGroup = new Array(m),
    //       enterGroup = new Array(m),
    //       exitGroup = new Array(n),
    //       node,
    //       nodeData;

    //   if (key) {
    //   } else {
    //   }

    //   enterGroup.parentNode = updateGroup.parentNode = exitGroup.parentNode = group.parentNode;
    //   enterGroups[j] = enterGroup;
    //   groups[j] = updateGroup;
    //   exitGroups[j] = exitGroup;
    // }

    this._root = visit(this._root, depth);
    return this;
  },

  // enter: function() {
  //   if (!this._e) {
  //     for (var groups = this._, j = 0, m = groups.length, group, enterGroups = new Array(m), enterGroup; j < m; ++j) {
  //       group = groups[j];
  //       enterGroups[j] = enterGroup = new Array(group.length);
  //       enterGroup.parentNode = group.parentNode;
  //     }
  //     this._e = new EnterSelection(enterGroups, this);
  //   }
  //   return this._e;
  // },

  // exit: function() {
  //   if (!this._x) {
  //     for (var groups = this._, j = 0, m = groups.length, group, exitGroups = new Array(m), exitGroup; j < m; ++j) {
  //       group = groups[j];
  //       exitGroups[j] = exitGroup = new Array(group.length);
  //       exitGroup.parentNode = group.parentNode;
  //     }
  //     this._x = new Selection(exitGroups);
  //   }
  //   return this._x;
  // },

  each: function(callback) {
    var depth = this._depth,
        stack = new Array(depth);

    function each(nodes, depth) {
      var i = -1,
          n = nodes.length,
          node,
          stack0 = --depth * 2,
          stack1 = stack0 + 1;

      if (stack0) while (++i < n) {
        node = nodes[i];
        stack[stack0] = node._parent.__data__, stack[stack1] = i;
        each(node, depth);
      }

      else while (++i < n) {
        if (node = nodes[i]) {
          stack[stack0] = node.__data__, stack[stack1] = i;
          callback.apply(node, stack);
        }
      }
    }

    each(this._root, depth);
    return this;
  },

  attr: function(name, value) {
    name = namespace.qualify(name);

    if (arguments.length < 2) {
      var node = this.node();
      return name.local
          ? node.getAttributeNS(name.space, name.local)
          : node.getAttribute(name);
    }

    function remove() {
      this.removeAttribute(name);
    }

    function removeNS() {
      this.removeAttributeNS(name.space, name.local);
    }

    function setConstant() {
      this.setAttribute(name, value);
    }

    function setConstantNS() {
      this.setAttributeNS(name.space, name.local, value);
    }

    function setFunction() {
      var x = value.apply(this, arguments);
      if (x == null) this.removeAttribute(name);
      else this.setAttribute(name, x);
    }

    function setFunctionNS() {
      var x = value.apply(this, arguments);
      if (x == null) this.removeAttributeNS(name.space, name.local);
      else this.setAttributeNS(name.space, name.local, x);
    }

    return this.each(value == null
        ? (name.local ? removeNS : remove)
        : (typeof value === "function"
            ? (name.local ? setFunctionNS : setFunction)
            : (name.local ? setConstantNS : setConstant)));
  },

  style: function(name, value, priority) {
    var n = arguments.length;

    if (n < 2) return windowOf(n = this.node()).getComputedStyle(n, null).getPropertyValue(name);

    if (n < 3) priority = "";

    function remove() {
      this.style.removeProperty(name);
    }

    function setConstant() {
      this.style.setProperty(name, value, priority);
    }

    function setFunction() {
      var x = value.apply(this, arguments);
      if (x == null) this.style.removeProperty(name);
      else this.style.setProperty(name, x, priority);
    }

    return this.each(value == null
        ? remove
        : (typeof value === "function"
            ? setFunction
            : setConstant));
  },

  property: function(name, value) {
    if (arguments.length < 2) return this.node()[name];

    function remove() {
      delete this[name];
    }

    function setConstant() {
      this[name] = value;
    }

    function setFunction() {
      var x = value.apply(this, arguments);
      if (x == null) delete this[name];
      else this[name] = x;
    }

    return this.each(value == null
        ? remove
        : (typeof value === "function"
            ? setFunction
            : setConstant));
  },

  class: function(name, value) {
    name = wordsOf(name);
    var n = name.length;

    if (arguments.length < 2) {
      var node = this.node(), i = -1;
      if (value = node.classList) { // SVG elements may not support DOMTokenList!
        while (++i < n) if (!value.contains(name[i])) return false;
      } else {
        value = node.getAttribute("class");
        while (++i < n) if (!classedRe(name[i]).test(value)) return false;
      }
      return true;
    }

    name = name.map(classerOf);

    function setConstant() {
      var i = -1;
      while (++i < n) name[i](this, value);
    }

    function setFunction() {
      var i = -1, x = value.apply(this, arguments);
      while (++i < n) name[i](this, x);
    }

    return this.each(typeof value === "function"
        ? setFunction
        : setConstant);
  },

  text: function(value) {
    if (!arguments.length) return this.node().textContent;

    function setConstant() {
      this.textContent = value;
    }

    function setFunction() {
      var v = value.apply(this, arguments);
      this.textContent = v == null ? "" : v;
    }

    if (value == null) value = "";

    return this.each(typeof value === "function"
        ? setFunction
        : setConstant);
  },

  html: function(value) {
    if (!arguments.length) return this.node().innerHTML;

    function setConstant() {
      this.innerHTML = value;
    }

    function setFunction() {
      var v = value.apply(this, arguments);
      this.innerHTML = v == null ? "" : v;
    }

    if (value == null) value = "";

    return this.each(typeof value === "function"
        ? setFunction
        : setConstant);
  },

  append: function(name) {
    name = creatorOf(name);
    return this.select(function() {
      return this.appendChild(name.apply(this, arguments));
    });
  },

  insert: function(name, before) {
    name = creatorOf(name);
    before = selectorOf(before);
    return this.select(function() {
      return this.insertBefore(name.apply(this, arguments), before.apply(this, arguments) || null);
    });
  },

  remove: function() {
    return this.each(function() {
      var parent = this.parentNode;
      if (parent) parent.removeChild(this);
    });
  },

  datum: function(value) {
    return arguments.length
        ? this.property("__data__", value)
        : this.node().__data__;
  },

  // order: function() {
  //   for (var groups = this._, j = 0, m = groups.length; j < m; ++j) {
  //     for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0;) {
  //       if (node = group[i]) {
  //         if (next && next !== node.nextSibling) next.parentNode.insertBefore(node, next);
  //         next = node;
  //       }
  //     }
  //   }
  //   return this;
  // },

  // sort: function(comparator) {
  //   comparator = arguments.length ? comparatorOf(comparator) : ascending;
  //   for (var groups = this._, j = -1, m = groups.length; ++j < m;) groups[j].sort(comparator);
  //   return this.order();
  // },

  event: function(type, listener, capture) {
    var n = arguments.length,
        key = "__on" + type,
        wrap = listenerOf;

    if (n < 2) return (n = this.node()[key]) && n._;

    if (n < 3) capture = false;

    if ((n = type.indexOf(".")) > 0) type = type.slice(0, n);

    if (filteredEvents.hasOwnProperty(type)) wrap = filteredListenerOf, type = filteredEvents[type];

    function add() {
      var l = wrap(listener, slice.call(arguments));
      remove.call(this);
      this.addEventListener(type, this[key] = l, l.$ = capture);
      l._ = listener;
    }

    function remove() {
      var l = this[key];
      if (l) {
        this.removeEventListener(type, l, l.$);
        delete this[key];
      }
    }

    function removeAll() {
      var re = new RegExp("^__on([^.]+)" + requote(type) + "$"), match;
      for (var name in this) {
        if (match = name.match(re)) {
          var l = this[name];
          this.removeEventListener(match[1], l, l.$);
          delete this[name];
        }
      }
    }

    return this.each(listener
        ? (n ? add : noop) // Attempt to add untyped listener is ignored.
        : (n ? remove : removeAll));
  },

  dispatch: function(type, params) {

    function dispatchConstant() {
      return this.dispatchEvent(new CustomEvent(type, params));
    }

    function dispatchFunction() {
      return this.dispatchEvent(new CustomEvent(type, params.apply(this, arguments)));
    }

    return this.each(typeof params === "function"
        ? dispatchFunction
        : dispatchConstant);
  },

  call: function(callback) {
    var args = slice.call(arguments);
    callback.apply(args[0] = this, args);
    return this;
  },

  empty: function() {
    return !this.node();
  },

  // nodes: function() {
  //   for (var groups = this._, nodes = new Array(lengthOf(groups)), j = 0, k = 0, m = groups.length; j < m; ++j) {
  //     for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i, ++k) {
  //       if (node = group[i]) nodes[k] = node;
  //     }
  //   }
  //   return nodes;
  // },

  // node: function() {
  //   for (var groups = this._, j = 0, m = groups.length; j < m; ++j) {
  //     for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
  //       if (node = group[i]) return node;
  //     }
  //   }
  //   return null;
  // },

  size: function() {
    var size = 0;
    this.each(function() { ++size; });
    return size;
  }
};

Selection.select = function(selector) {
  var root = [typeof selector === "string" ? document.querySelector(selector) : selector];
  root._parent = null;
  root._leaf = true;
  return new Selection(root, 1);
};

Selection.selectAll = function(selector) {
  var root = typeof selector === "string" ? document.querySelectorAll(selector) : selector;
  root._parent = null;
  root._leaf = true;
  return new Selection(root, 1);
};

function EnterSelection(update, root, depth) {
  Selection.call(this, root, depth);
  this._update = update;
}

EnterSelection.prototype = Object.create(Selection.prototype);

// EnterSelection.prototype.select = function(creator) { // Note: not selector!
//   for (var groups = this._, j = 0, m = groups.length, updateGroups = this._u._, subgroups = new Array(m); j < m; ++j) {
//     for (var updateGroup = updateGroups[j], group = groups[j], i = 0, n = group.length, subgroup = subgroups[j] = new Array(n), node, d; i < n; ++i) {
//       if (node = group[i]) {
//         (subgroup[i] = updateGroup[i] = creator.call(group.parentNode, d = node.__data__, i, j)).__data__ = d;
//       }
//     }
//     subgroup.parentNode = group.parentNode;
//   }

//   return new Selection(subgroups);
// };

// EnterSelection.prototype.insert = function(name, before) {
//   if (arguments.length < 2) before = selectorUpdateOf(this);
//   return Selection.prototype.insert.call(this, name, before);
// };

function EnterNode(data) {
  this.__data__ = data;
}

function wordsOf(string) {
  return (string + "").trim().split(/^|\s+/);
}

function noop() {}

function selectorOf(selector) {
  return typeof selector === "function" ? selector : function() {
    return this.querySelector(selector);
  };
}

function selectorAllOf(selector) {
  return typeof selector === "function" ? selector : function() {
    return this.querySelectorAll(selector);
  };
}

// function selectorUpdateOf(enter) {
//   var i0, j0;
//   return function(d, i, j) {
//     var group = enter._u._[j],
//         n = group.length,
//         node;
//     if (j != j0) j0 = j, i0 = 0;
//     if (i >= i0) i0 = i + 1;
//     while (!(node = group[i0]) && ++i0 < n);
//     return node;
//   };
// }

function filterOf(filter) {
  return typeof filter === "function" ? filter : function() {
    return this.matches(filter); // TODO vendor-specific matchesSelector
  };
}

function valueOf(value) {
  return typeof value === "function" ? value : function() {
    return value;
  };
}

function creatorOf(name) {

  function creator() {
    var document = this.ownerDocument,
        uri = this.namespaceURI;
    return uri
        ? document.createElementNS(uri, name)
        : document.createElement(name);
  }

  function creatorNS() {
    return this.ownerDocument.createElementNS(name.space, name.local);
  }

  return typeof name === "function"
      ? name
      : (name = namespace.qualify(name)).local
          ? creatorNS
          : creator;
}

function windowOf(node) {
  return node
      && ((node.ownerDocument && node.ownerDocument.defaultView) // node is a Node
          || (node.document && node) // node is a Window
          || node.defaultView); // node is a Document
}

// function documentElementOf(node) {
//   return node
//       && (node.ownerDocument // node is a Element
//       || node.document // node is a Window
//       || node).documentElement; // node is a Document
// }

// function comparatorOf(comparator) {
//   return function(a, b) {
//     return a && b ? comparator(a.__data__, b.__data__) : !a - !b;
//   };
// }

// function lengthOf(groups) {
//   for (var length = 0, j = 0, m = groups.length; j < m; ++j) length += groups[j].length;
//   return length;
// }

function classRe(name) {
  return new RegExp("(?:^|\\s+)" + requote(name) + "(?:\\s+|$)", "g");
}

function classerOf(name) {
  var re = classRe(name);
  return function(node, value) {
    if (c = node.classList) return value ? c.add(name) : c.remove(name);
    var c = node.getAttribute("class") || "";
    if (value) {
      re.lastIndex = 0;
      if (!re.test(c)) node.setAttribute("class", collapse(c + " " + name));
    } else {
      node.setAttribute("class", collapse(c.replace(re, " ")));
    }
  };
}

function listenerOf(listener, args) {
  return function(e) {
    var o = global.d3.event; // Events can be reentrant (e.g., focus).
    global.d3.event = e;
    args[0] = this.__data__;
    try {
      listener.apply(this, args);
    } finally {
      global.d3.event = o;
    }
  };
}

function filteredListenerOf(listener, args) {
  var l = listenerOf(listener, args);
  return function(e) {
    var target = this, related = e.relatedTarget;
    if (!related || (related !== target && !(related.compareDocumentPosition(target) & 8))) {
      l.call(target, e);
    }
  };
}

// function ascending(a, b) {
//   return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
// }

function collapse(string) {
  return string.trim().replace(/\s+/g, " ");
}

function requote(string) {
  return string.replace(requoteRe, "\\$&");
}

module.exports = Selection;