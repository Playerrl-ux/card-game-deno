//Lembrar de testar essa classe depois
export class ListNode<T> {
  value: T;
  left: ListNode<T> | null = null;
  right: ListNode<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }
}

//Era melhor o nome ser circular list, mas fodase
export class DoubleLinkedList<T> {
  head: ListNode<T> | null = null;
  tail: ListNode<T> | null = null;
  size: number = 0;

  constructor(initialValues?: T[]) {
    if (initialValues?.length == 1) {
      throw new Error("Initial values array must have at least two values");
    }
    if (initialValues) {
      initialValues.forEach((val) => this.push(val));
    }
  }

  /**
   * Mantém a natureza circular da lista.
   */
  private linkCircle(): void {
    if (this.head && this.tail) {
      this.head.left = this.tail;
      this.tail.right = this.head;
    }
  }

  /**
   * Adiciona um item ao final da lista (à direita).
   */
  push(value: T): ListNode<T> {
    const newNode = new ListNode(value);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      this.tail!.right = newNode;
      newNode.left = this.tail;
      this.tail = newNode;
    }
    this.size++;
    this.linkCircle();
    return newNode;
  }

  /**
   * Adiciona um item ao início da lista (à esquerda).
   */
  unshift(value: T): ListNode<T> {
    const newNode = new ListNode(value);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.right = this.head;
      this.head.left = newNode;
      this.head = newNode;
    }
    this.size++;
    this.linkCircle();
    return newNode;
  }

  /**
   * Remove e retorna o item do final da lista (à direita).
   */
  pop(): T | null {
    if (!this.tail) return null;
    const removedValue = this.tail.value;
    if (this.head === this.tail) {
      this.head = null;
      this.tail = null;
    } else {
      this.tail = this.tail.left;
      this.size--; // Decrementamos aqui para o linkCircle funcionar com o novo tamanho
      this.linkCircle();
      return removedValue;
    }
    this.size--;
    return removedValue;
  }

  /**
   * Remove e retorna o item do início da lista (à esquerda).
   */
  shift(): T | null {
    if (!this.head) return null;
    const removedValue = this.head.value;
    if (this.head === this.tail) {
      this.head = null;
      this.tail = null;
    } else {
      this.head = this.head.right;
      this.size--;
      this.linkCircle();
      return removedValue;
    }
    this.size--;
    return removedValue;
  }

  /**
   * Remove um nó específico da lista de qualquer posição.
   */
  remove(node: ListNode<T>): void {
    if (this.size === 0) return;

    if (this.head === this.tail && this.head === node) {
      this.head = null;
      this.tail = null;
    } else {
      if (node === this.head) this.head = node.right;
      if (node === this.tail) this.tail = node.left;

      if (node.left) node.left.right = node.right;
      if (node.right) node.right.left = node.left;

      this.linkCircle();
    }

    this.size--;
    node.left = null;
    node.right = null;
  }

  /**
   * Converte a lista para um array.
   */
  toArray(): T[] {
    const result: T[] = [];
    if (!this.head) return result;

    let current = this.head;
    do {
      result.push(current.value);
      current = current.right!;
    } while (current !== this.head);

    return result;
  }

  /**
   * Limpa a lista.
   */
  clear(): void {
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  find(value: T): ListNode<T> | undefined {
    if (!this.head) {
      return undefined;
    }
    if (this.head.value == value) {
      return this.head;
    }

    const head1 = this.head;
    let current = this.head.right;

    while (current !== head1) {
      if (!current?.right) {
        return undefined;
      }
      if (current.value == value) return current;
      current = current?.right;
    }

    return undefined;
  }
}
