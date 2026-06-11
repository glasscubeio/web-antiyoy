interface Props {
  log: string[]
}

export default function LogPanel({ log }: Props) {
  return (
    <div className="w-44 flex-shrink-0 bg-gray-900 border-l border-gray-700 overflow-y-auto flex flex-col-reverse p-2 gap-0.5">
      {log.map((msg, i) => (
        <div key={i} className={`text-xs px-1 py-0.5 rounded ${i === 0 ? 'text-white' : 'text-gray-500'}`}>
          {msg}
        </div>
      ))}
    </div>
  )
}
