import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { errorText, Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { joinWithToken } from '../lib/store/cloud'

/** Opened from a share link: /join/:treeId?k=token&r=viewer|editor */
export default function Join() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { user, enabled } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const [error, setError] = useState('')
  const token = params.get('k') ?? ''
  const role = params.get('r') === 'editor' ? 'editor' : 'viewer'

  useEffect(() => {
    if (!user || !token) return
    joinWithToken(id, token, role, user, user.displayName)
      .then(() => nav(`/t/${id}`, { replace: true }))
      .catch((e) => setError((e as { code?: string }).code === 'permission-denied' ? 'Liên kết chia sẻ không còn hiệu lực hoặc đã bị tắt.' : errorText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, id, token, role])

  if (!enabled || !token) return <div className="p-8 text-center text-stone-500">Liên kết chia sẻ không hợp lệ.</div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (error)
    return (
      <div className="p-8 text-center text-stone-600">
        {error} <Link to="/" className="text-brand-700 underline">Về trang chủ</Link>
      </div>
    )
  return <Spinner label="Đang tham gia cây gia phả…" />
}
