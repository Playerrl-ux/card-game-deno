import { describe, expect, test } from "vitest";
import { DoubleLinkedList } from "../structures/double-linked.list.ts";

describe("DoubleLinkedList (Circular)", () => {
  test("deve inicializar com múltiplos valores", () => {
    const list = new DoubleLinkedList([1, 2, 3]);
    expect(list.size).toBe(3);
    expect(list.toArray()).toEqual([1, 2, 3]);
  });

  test("deve lançar erro ao inicializar com apenas 1 valor", () => {
    expect(() => new DoubleLinkedList([1])).toThrow(
      "Initial values array must have at least two values",
    );
  });

  test("deve manter natureza circular no push", () => {
    const list = new DoubleLinkedList<number>();
    list.push(1);
    list.push(2);

    expect(list.head?.value).toBe(1);
    expect(list.tail?.value).toBe(2);
    expect(list.head?.left).toBe(list.tail);
    expect(list.tail?.right).toBe(list.head);
  });

  test("unshift deve adicionar ao início e manter circularidade", () => {
    const list = new DoubleLinkedList([2, 3]);
    list.unshift(1);

    expect(list.head?.value).toBe(1);
    expect(list.size).toBe(3);
    expect(list.head?.left).toBe(list.tail);
    expect(list.tail?.right).toBe(list.head);
    expect(list.toArray()).toEqual([1, 2, 3]);
  });

  test("pop deve remover do final", () => {
    const list = new DoubleLinkedList([1, 2, 3]);
    const val = list.pop();

    expect(val).toBe(3);
    expect(list.size).toBe(2);
    expect(list.tail?.value).toBe(2);
    expect(list.tail?.right).toBe(list.head);
  });

  test("shift deve remover do início", () => {
    const list = new DoubleLinkedList([1, 2, 3]);
    const val = list.shift();

    expect(val).toBe(1);
    expect(list.size).toBe(2);
    expect(list.head?.value).toBe(2);
    expect(list.head?.left).toBe(list.tail);
  });

  test("remove deve remover nó específico", () => {
    const list = new DoubleLinkedList([1, 2, 3]);
    const nodeToRemove = list.head?.right!; // 2
    list.remove(nodeToRemove);

    expect(list.size).toBe(2);
    expect(list.toArray()).toEqual([1, 3]);
    expect(list.head?.right?.value).toBe(3);
    expect(list.tail?.left?.value).toBe(1);
  });

  test("find deve encontrar player (ou valor) na lista", () => {
    const player1 = { id: 1 } as any;
    const player2 = { id: 2 } as any;
    const list = new DoubleLinkedList([player1, player2]);

    const foundNode = list.find(player2);
    expect(foundNode.value).toBe(player2);
  });
});
