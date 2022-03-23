using UnityEngine;
using UnityEngine.XR.Interaction.Toolkit;

public class saber : MonoBehaviour
{
    public Slicer slicer;
    public LayerMask pointLayer;
    public LayerMask otherSaber;
    public LayerMask sliceableLayer;
    public LayerMask missLayer;
    public ActionBasedController xr;

    //private Vector3 _previousPos;

    private void OnTriggerEnter(Collider other)
    {
        if ((pointLayer.value & (1 << other.transform.gameObject.layer)) > 0)
        {
            Destroy(other.GetComponent<BoxCollider>());
            FindObjectOfType<Scoreboard>().IncreaseHits();
        }


        if ((missLayer.value & (1 << other.transform.gameObject.layer)) > 0)
        {
            Destroy(other.GetComponent<BoxCollider>());
            FindObjectOfType<Scoreboard>().IncreaseMisses();
        }

        //_previousPos = transform.position;

        if ((sliceableLayer.value & (1 << other.transform.gameObject.layer)) > 0)
        {
            slicer.isTouched = true;
            xr.SendHapticImpulse(1.0f, .1f);
        }
    }

    private void OnTriggerStay(Collider other)
    {
        if ((sliceableLayer.value & (1 << other.transform.gameObject.layer)) > 0)
        {
            slicer.isTouched = true;
            xr.SendHapticImpulse(1.0f, .1f);
        }

        if ((otherSaber.value & (1 << other.transform.gameObject.layer)) > 0) xr.SendHapticImpulse(1.0f, .1f);
    }
}
